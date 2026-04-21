// server/routes/etlUpload.ts
// ETL Upload API — accepts parsed CSV rows, bulk-inserts into the target
// Supabase table, creates an etl_runs record, and optionally pushes to Azure SQL.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { getPool } from '../lib/azureSql.js';
import { getPoolForConnection } from '../lib/sqlPool.js';
import type { SqlConnectionRecord } from '../lib/sqlPool.js';
import { analyseEtlDataset } from '@heqcis/ai';
import type { EtlAnalysisInput, FieldStat } from '@heqcis/ai';
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
  umalusi_matric_results:  'umalusi_matric_results',
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
  umalusi_matric_results: [
    'candidate_number','surname','first_name','id_number','school_emis','school_name',
    'province','district','examination_year','subject_code','subject_name','mark','symbol',
    'result_status','gender','date_of_birth','home_language','qualification_type',
    'aggregate_mark','distinction_count','certificate_type','endorsed','special_needs',
    'centre_number','remarks',
  ],
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
  umalusi_matric_results: 'dbo.UmalusiMatricResults',
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

// ── POST /api/etl-upload/push-azure — push CSV rows to any configured SQL Server ──
etlUploadRouter.post('/push-azure', async (req: Request, res: Response) => {
  const { job_name, rows, connection_id } = req.body as UploadBody & { connection_id?: string };

  const azureTable = AZURE_SQL_TABLE[job_name];
  if (!azureTable) {
    res.status(400).json({ error: `No SQL table mapping for job_name "${job_name}".` });
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows must be a non-empty array.' });
    return;
  }

  const allowedCols = ALLOWED_COLUMNS[job_name]!;

  // ── Resolve which SQL pool to use ──────────────────────────────────────────
  // If connection_id is provided, fetch the connection record from Supabase
  // and build a pool from it. Otherwise fall back to the default env-var pool.
  let resolvedPool: Awaited<ReturnType<typeof getPool>>;
  let connectionLabel = 'Default (env)';

  if (connection_id) {
    const { data: connRecord, error: connErr } = await adminClient
      .from('sql_connections')
      .select('*')
      .eq('id', connection_id)
      .eq('is_active', true)
      .single();

    if (connErr || !connRecord) {
      res.status(400).json({ error: `SQL connection "${connection_id}" not found or inactive.` });
      return;
    }

    resolvedPool    = await getPoolForConnection(connRecord as unknown as SqlConnectionRecord);
    connectionLabel = (connRecord as { label: string }).label;
  } else {
    resolvedPool = await getPool();
  }

  // Create etl_run record
  const { data: runRecord, error: runCreateErr } = await adminClient
    .from('etl_runs')
    .insert({
      job_name:      `${job_name}_sql_push`,
      source:        'manual',
      status:        'running',
      started_at:    new Date().toISOString(),
      pipeline_name: connectionLabel,
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
    const pool = resolvedPool;

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

// ── POST /api/etl-upload/analyse — AI conformance scoring ────────────────────
// Accepts parsed rows + dataset metadata, computes field statistics,
// calls OpenAI, and returns the conformance report.
// Does NOT write to any database — analysis only.

interface AnalyseBody {
  job_name:      string;
  dataset_label: string;
  required_cols: string[];
  optional_cols: string[];
  headers:       string[];
  rows:          Record<string, string>[];
}

etlUploadRouter.post('/analyse', async (req: Request, res: Response) => {
  const { job_name, dataset_label, required_cols, optional_cols, headers, rows } =
    req.body as AnalyseBody;

  if (!job_name || !Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'job_name and a non-empty rows array are required.' });
    return;
  }

  // ── Compute field statistics ────────────────────────────────────────────
  const allCols = [...(required_cols ?? []), ...(optional_cols ?? [])];

  function suspectedType(samples: string[]): string {
    const dateRx   = /^\d{4}-\d{2}-\d{2}|^\d{2}[\/\-]\d{2}[\/\-]\d{4}/;
    const numberRx = /^-?\d+(\.\d+)?$/;
    const boolRx   = /^(true|false|yes|no|1|0)$/i;
    const enumMax  = 10; // if ≤ 10 distinct values, likely enum
    const nonEmpty = samples.filter(Boolean);
    if (nonEmpty.length === 0) return 'unknown';
    if (nonEmpty.every((v) => numberRx.test(v.trim()))) return 'number';
    if (nonEmpty.every((v) => boolRx.test(v.trim()))) return 'boolean';
    if (nonEmpty.every((v) => dateRx.test(v.trim()))) return 'date';
    const unique = new Set(nonEmpty.map((v) => v.toLowerCase().trim())).size;
    if (unique <= enumMax && nonEmpty.length > enumMax) return 'enum';
    return 'text';
  }

  const field_stats: FieldStat[] = allCols.map((field) => {
    const values    = rows.map((r) => r[field] ?? '');
    const nonEmpty  = values.filter((v) => v.trim() !== '');
    const uniqueSet = new Set(nonEmpty.map((v) => v.trim().toLowerCase()));
    const sampleSet = [...uniqueSet].slice(0, 10);

    return {
      field,
      required:      (required_cols ?? []).includes(field),
      present:       headers.includes(field),
      non_empty_pct: rows.length > 0 ? (nonEmpty.length / rows.length) * 100 : 0,
      unique_count:  uniqueSet.size,
      sample_values: sampleSet,
      has_nulls:     nonEmpty.length < rows.length,
      suspected_type: suspectedType(nonEmpty.slice(0, 50)),
    };
  });

  // Also include stats for any headers not in the schema (unknown cols)
  const unknownHeaders = headers.filter((h) => !allCols.includes(h));
  for (const field of unknownHeaders) {
    const values    = rows.map((r) => r[field] ?? '');
    const nonEmpty  = values.filter((v) => v.trim() !== '');
    const uniqueSet = new Set(nonEmpty.map((v) => v.trim().toLowerCase()));
    field_stats.push({
      field,
      required:      false,
      present:       true,
      non_empty_pct: rows.length > 0 ? (nonEmpty.length / rows.length) * 100 : 0,
      unique_count:  uniqueSet.size,
      sample_values: [...uniqueSet].slice(0, 10),
      has_nulls:     nonEmpty.length < rows.length,
      suspected_type: suspectedType(nonEmpty.slice(0, 50)),
    });
  }

  const input: EtlAnalysisInput = {
    job_name,
    dataset_label,
    required_cols: required_cols ?? [],
    optional_cols: optional_cols ?? [],
    headers,
    row_count:    rows.length,
    sample_rows:  rows.slice(0, 50),
    field_stats,
  };

  try {
    const result = await analyseEtlDataset(input);
    res.json({
      output:            result.output,
      model:             result.model,
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      field_stats,
    });
  } catch (err) {
    console.error('[etlUpload:analyse]', err);
    res.status(500).json({ error: 'AI analysis failed.', detail: (err as Error).message });
  }
});
