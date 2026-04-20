// server/routes/etlUpload.ts
// ETL Upload API — accepts parsed CSV rows, bulk-inserts into the target
// Supabase table, creates an etl_runs record, and optionally pushes to Azure SQL.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { getPool } from '../lib/azureSql.js';
import type * as sql from 'mssql';

export const etlUploadRouter = Router();

// ── Allowed table targets ──────────────────────────────────────────────────────
// Maps job_name → Supabase table. Only whitelisted names accepted.
const ALLOWED_TABLES: Record<string, string> = {
  incidents:               'incidents',
  backup_runs:             'backup_runs',
  maintenance_activities:  'maintenance_activities',
  security_findings:       'security_findings',
  popia_events:            'popia_events',
  change_requests:         'change_requests',
  handover_items:          'handover_items',
  submission_readiness:    'submission_readiness',
};

// ── Columns allowed per table (whitelist to prevent injection) ────────────────
const ALLOWED_COLUMNS: Record<string, string[]> = {
  incidents:              ['title','severity','category','affected_system','assigned_to','description','status'],
  backup_runs:            ['job_name','server_name','database_name','status','started_at','finished_at','size_gb'],
  maintenance_activities: ['title','system_name','maintenance_type','scheduled_start','scheduled_end','assigned_to','notes','status'],
  security_findings:      ['title','severity','category','affected_system','discovered_at','remediation_notes','status'],
  popia_events:           ['event_type','description','data_subject_count','reported_at','outcome'],
  change_requests:        ['title','change_type','requested_by','target_date','justification','risk_level','status'],
  handover_items:         ['title','category','priority','assigned_to','due_date','notes','status'],
  submission_readiness:   ['dataset_name','period','status','notes'],
};

// ── Azure SQL table mapping ───────────────────────────────────────────────────
const AZURE_SQL_TABLE: Record<string, string> = {
  incidents:              'dbo.Incidents',
  backup_runs:            'dbo.BackupRuns',
  maintenance_activities: 'dbo.MaintenanceActivities',
  security_findings:      'dbo.SecurityFindings',
  popia_events:           'dbo.PopiaEvents',
  change_requests:        'dbo.ChangeRequests',
  handover_items:         'dbo.HandoverItems',
  submission_readiness:   'dbo.SubmissionReadiness',
};

interface UploadBody {
  job_name: string;
  rows:     Record<string, unknown>[];
}

// ── POST /api/etl-upload — save CSV rows to Supabase ─────────────────────────
etlUploadRouter.post('/', async (req: Request, res: Response) => {
  const { job_name, rows } = req.body as UploadBody;

  const table = ALLOWED_TABLES[job_name];
  if (!table) {
    res.status(400).json({ error: `Unknown job_name "${job_name}". Allowed: ${Object.keys(ALLOWED_TABLES).join(', ')}` });
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows must be a non-empty array.' });
    return;
  }

  const allowedCols = ALLOWED_COLUMNS[job_name]!;

  // Sanitise rows — strip any keys not in the whitelist
  const sanitised = rows.map((row) => {
    const clean: Record<string, unknown> = {};
    for (const col of allowedCols) {
      if (row[col] !== undefined && row[col] !== '') clean[col] = row[col];
    }
    return clean;
  });

  // Create an etl_runs record (running)
  const { data: runRecord, error: runCreateErr } = await adminClient
    .from('etl_runs')
    .insert({
      job_name,
      source:     'manual',
      status:     'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runCreateErr) {
    console.error('[etlUpload] Failed to create etl_run:', runCreateErr);
    res.status(500).json({ error: 'Failed to create ETL run record.' });
    return;
  }

  const etlRunId = runRecord.id as string;

  // Bulk-insert into Supabase (batches of 500)
  const BATCH = 500;
  let rowsInserted = 0;
  let rowsFailed   = 0;
  const errors: string[] = [];

  for (let i = 0; i < sanitised.length; i += BATCH) {
    const batch = sanitised.slice(i, i + BATCH);
    const { error: insertErr, count } = await adminClient
      .from(table)
      .insert(batch, { count: 'exact' });

    if (insertErr) {
      rowsFailed += batch.length;
      errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${insertErr.message}`);
    } else {
      rowsInserted += count ?? batch.length;
    }
  }

  const finalStatus = rowsFailed === 0 ? 'success' : rowsInserted === 0 ? 'failed' : 'partial';

  // Update the etl_run with results
  await adminClient.from('etl_runs').update({
    status:         finalStatus,
    rows_processed: rowsInserted,
    rows_failed:    rowsFailed,
    finished_at:    new Date().toISOString(),
    error_message:  errors.length > 0 ? errors.join(' | ') : null,
  }).eq('id', etlRunId);

  res.status(201).json({
    etl_run_id:    etlRunId,
    rows_inserted: rowsInserted,
    rows_failed:   rowsFailed,
    status:        finalStatus,
    errors,
  });
});

// ── POST /api/etl-upload/push-azure — push Supabase rows to Azure SQL ─────────
etlUploadRouter.post('/push-azure', async (req: Request, res: Response) => {
  const { job_name, rows } = req.body as UploadBody;

  const azureTable = AZURE_SQL_TABLE[job_name];
  if (!azureTable) {
    res.status(400).json({ error: `No Azure SQL mapping for job_name "${job_name}".` });
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows must be a non-empty array.' });
    return;
  }

  const allowedCols = ALLOWED_COLUMNS[job_name]!;

  // Create etl_run record
  const { data: runRecord, error: runCreateErr } = await adminClient
    .from('etl_runs')
    .insert({
      job_name:      `${job_name}_azure_push`,
      source:        'manual',
      status:        'running',
      started_at:    new Date().toISOString(),
      pipeline_name: 'azure_sql_push',
    })
    .select()
    .single();

  if (runCreateErr) {
    console.error('[etlUpload:push] Failed to create etl_run:', runCreateErr);
    res.status(500).json({ error: 'Failed to create ETL run record.' });
    return;
  }

  const etlRunId = runRecord.id as string;

  try {
    const pool = await getPool();

    // Build parameterised bulk INSERT using table-valued approach (row by row)
    let rowsInserted = 0;
    let rowsFailed   = 0;
    const errors: string[] = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx]!;
      // Strip unknown cols
      const clean: Record<string, unknown> = {};
      for (const col of allowedCols) {
        if (row[col] !== undefined && row[col] !== '') clean[col] = row[col];
      }

      const cols   = Object.keys(clean);
      const params = cols.map((_, i) => `@p${idx}_${i}`).join(', ');
      const colStr = cols.map((c) => `[${c}]`).join(', ');
      const query  = `INSERT INTO ${azureTable} (${colStr}) VALUES (${params})`;

      try {
        const request = pool.request();
        cols.forEach((col, i) => {
          request.input(`p${idx}_${i}`, clean[col] as sql.ISqlType | string | number | boolean | null | Date);
        });
        await request.query(query);
        rowsInserted++;
      } catch (rowErr) {
        rowsFailed++;
        errors.push(`Row ${idx + 1}: ${(rowErr as Error).message}`);
      }
    }

    const finalStatus = rowsFailed === 0 ? 'success' : rowsInserted === 0 ? 'failed' : 'partial';

    await adminClient.from('etl_runs').update({
      status:         finalStatus,
      rows_processed: rowsInserted,
      rows_failed:    rowsFailed,
      finished_at:    new Date().toISOString(),
      error_message:  errors.length > 0 ? errors.slice(0, 5).join(' | ') : null,
    }).eq('id', etlRunId);

    res.json({
      etl_run_id:    etlRunId,
      rows_inserted: rowsInserted,
      rows_failed:   rowsFailed,
      status:        finalStatus,
      errors:        errors.slice(0, 10),
    });
  } catch (err) {
    console.error('[etlUpload:push-azure]', err);

    await adminClient.from('etl_runs').update({
      status:        'failed',
      rows_failed:   rows.length,
      finished_at:   new Date().toISOString(),
      error_message: (err as Error).message,
    }).eq('id', etlRunId);

    res.status(500).json({ error: 'Failed to push to Azure SQL.', detail: (err as Error).message });
  }
});
