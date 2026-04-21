// server/routes/sqlEtlUpload.ts
// SQL ETL — Extract from a configured SQL source, optionally rename/map columns,
// then load into Supabase and / or a configured SQL destination.
//
// Flow:
//   POST /api/sql-etl-upload/extract  →  runs SELECT on source, returns rows
//   POST /api/sql-etl-upload/run      →  loads extracted rows into targets

import { Router }      from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { getPoolForConnection } from '../lib/sqlPool.js';
import type { SqlConnectionRecord } from '../lib/sqlPool.js';
import type * as sql from 'mssql';

export const sqlEtlUploadRouter = Router();

// ── Supabase target allow-lists ───────────────────────────────────────────────
// Mirrors etlUpload.ts — only whitelisted tables + columns accepted.

export const SUPABASE_TABLES: Record<string, string> = {
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

export const SUPABASE_COLUMNS: Record<string, string[]> = {
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

export const DATASET_LABELS: Record<string, string> = {
  incidents:               'Incidents',
  backup_runs:             'Backup Runs',
  maintenance_activities:  'Maintenance Activities',
  security_findings:       'Security Findings',
  popia_events:            'POPIA Events',
  change_requests:         'Change Requests',
  handover_items:          'Handover Items',
  submission_readiness:    'Submission Readiness',
  umalusi_matric_results:  'Umalusi Matric Results',
};

// ── Security: block all non-SELECT statements ─────────────────────────────────
function isSafeQuery(query: string): boolean {
  // Allow SELECT and WITH … SELECT (CTEs)
  const upper = query.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH ')) return false;
  const blocked = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|TRUNCATE|MERGE|GRANT|REVOKE|BULK\s+INSERT|INTO\s+#)\b/;
  return !blocked.test(upper);
}

// ── Resolve an active sql_connections row → connected pool ───────────────────
async function resolvePool(connection_id: string): Promise<sql.ConnectionPool> {
  const { data: rec, error } = await adminClient
    .from('sql_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('is_active', true)
    .single();

  if (error || !rec) {
    throw new Error(`SQL connection "${connection_id}" not found or inactive.`);
  }
  return getPoolForConnection(rec as unknown as SqlConnectionRecord);
}

// ── POST /api/sql-etl-upload/extract ─────────────────────────────────────────
// Runs a SELECT on the source connection and returns extracted rows.
//
// Body:    { source_connection_id, query, row_limit? }
// Returns: { columns, rows, total_extracted, truncated }

interface ExtractBody {
  source_connection_id: string;
  query:                string;
  row_limit?:           number;
}

sqlEtlUploadRouter.post('/extract', async (req: Request, res: Response) => {
  const { source_connection_id, query, row_limit = 3000 } = req.body as ExtractBody;

  if (!source_connection_id || !query?.trim()) {
    res.status(400).json({ error: 'source_connection_id and query are required.' });
    return;
  }

  if (!isSafeQuery(query)) {
    res.status(400).json({
      error:
        'Only SELECT (or WITH … SELECT) queries are permitted. ' +
        'INSERT, UPDATE, DELETE, DROP, EXEC and similar statements are blocked.',
    });
    return;
  }

  const limit = Math.min(Math.max(1, Number(row_limit) || 3000), 10_000);

  try {
    const pool   = await resolvePool(source_connection_id);
    const result = await pool.request().query(query);
    const allRows = result.recordset as Record<string, unknown>[];
    const rows    = allRows.slice(0, limit);

    // Column names: from first row data, or from mssql column metadata
    let columns: string[] = [];
    if (rows.length > 0) {
      columns = Object.keys(rows[0]);
    } else if (result.recordset.columns) {
      columns = Object.keys(result.recordset.columns);
    }

    res.json({
      columns,
      rows,
      total_extracted: rows.length,
      truncated:       allRows.length > limit,
    });
  } catch (err) {
    console.error('[sqlEtlUpload:extract]', err);
    res.status(500).json({ error: 'Extraction failed.', detail: (err as Error).message });
  }
});

// ── POST /api/sql-etl-upload/run ─────────────────────────────────────────────
// Loads already-extracted rows into one or both targets.
//
// column_map applies ONLY to the Supabase path (source_col → allowed_col rename).
// The SQL target path uses the raw extracted column names — the SELECT query
// aliases should match the target table schema.
//
// Body:
//   source_label        – human label used in etl_runs.pipeline_name
//   rows                – extracted row array (from /extract)
//   column_map?         – { sourceName: supabaseAllowedName } (Supabase only)
//   targets.supabase?   – { job_name }
//   targets.sql?        – { connection_id, table_name }

interface TargetResult {
  etl_run_id:    string;
  rows_inserted: number;
  rows_failed:   number;
  status:        'success' | 'partial' | 'failed';
  errors:        string[];
}

interface RunBody {
  source_label:  string;
  rows:          Record<string, unknown>[];
  column_map?:   Record<string, string>;
  targets: {
    supabase?: { job_name: string };
    sql?:      { connection_id: string; table_name: string };
  };
}

sqlEtlUploadRouter.post('/run', async (req: Request, res: Response) => {
  const {
    source_label = 'SQL ETL',
    rows,
    column_map = {},
    targets,
  } = req.body as RunBody;

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'rows must be a non-empty array. Run /extract first.' });
    return;
  }
  if (!targets?.supabase && !targets?.sql) {
    res.status(400).json({ error: 'At least one target (supabase or sql) must be configured.' });
    return;
  }

  const targetStatuses: Array<'success' | 'partial' | 'failed'> = [];

  const response: {
    rows_extracted: number;
    supabase?: TargetResult;
    sql?: TargetResult;
    status: 'success' | 'partial' | 'failed';
  } = { rows_extracted: rows.length, status: 'success' };

  // ── Target A: Supabase ──────────────────────────────────────────────────────
  // Applies column_map to rename source columns to Supabase allowed column names,
  // then sanitises each row to only the whitelisted columns for the dataset.
  if (targets.supabase) {
    const { job_name } = targets.supabase;
    const table        = SUPABASE_TABLES[job_name];
    const allowedCols  = SUPABASE_COLUMNS[job_name];

    if (!table || !allowedCols) {
      res.status(400).json({ error: `Unknown Supabase job_name "${job_name}".` });
      return;
    }

    // Apply rename map then sanitise
    const hasMap = Object.keys(column_map).length > 0;
    const sanitised = rows.map((row) => {
      // Step 1: rename
      const renamed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        renamed[hasMap ? (column_map[k] ?? k) : k] = v;
      }
      // Step 2: keep only allowed cols with non-empty values
      const clean: Record<string, unknown> = {};
      for (const col of allowedCols) {
        if (renamed[col] !== undefined && renamed[col] !== null && renamed[col] !== '') {
          clean[col] = renamed[col];
        }
      }
      return clean;
    });

    // Create etl_run
    const { data: runRec, error: runErr } = await adminClient
      .from('etl_runs')
      .insert({
        job_name,
        source:        'sql_etl',
        status:        'running',
        started_at:    new Date().toISOString(),
        pipeline_name: source_label,
      })
      .select()
      .single();

    if (runErr || !runRec) {
      res.status(500).json({ error: 'Failed to create ETL run for Supabase target.' });
      return;
    }
    const etlRunId = runRec.id as string;

    let rowsInserted = 0;
    let rowsFailed   = 0;
    const errors: string[] = [];
    const BATCH = 500;

    for (let i = 0; i < sanitised.length; i += BATCH) {
      const batch = sanitised.slice(i, i + BATCH);
      const { error: insErr, count } = await adminClient
        .from(table)
        .insert(batch, { count: 'exact' });
      if (insErr) {
        rowsFailed += batch.length;
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${insErr.message}`);
      } else {
        rowsInserted += count ?? batch.length;
      }
    }

    const status = (
      rowsFailed === 0 ? 'success' : rowsInserted === 0 ? 'failed' : 'partial'
    ) as 'success' | 'partial' | 'failed';

    await adminClient.from('etl_runs').update({
      status,
      rows_processed: rowsInserted,
      rows_failed:    rowsFailed,
      finished_at:    new Date().toISOString(),
      error_message:  errors.length > 0 ? errors.join(' | ') : null,
    }).eq('id', etlRunId);

    response.supabase = {
      etl_run_id:    etlRunId,
      rows_inserted: rowsInserted,
      rows_failed:   rowsFailed,
      status,
      errors:        errors.slice(0, 10),
    };
    targetStatuses.push(status);
  }

  // ── Target B: SQL ────────────────────────────────────────────────────────────
  // Uses the raw extracted column names (no column_map).
  // The user should alias columns in their SELECT query to match the target schema.
  if (targets.sql) {
    const { connection_id, table_name } = targets.sql;

    // Validate table_name to prevent SQL injection (allow word chars, dots, brackets, spaces)
    if (!/^[\w\.\[\]\s]+$/.test(table_name.trim())) {
      res.status(400).json({
        error: `Invalid table_name "${table_name}". Expected format: dbo.TableName or [schema].[table].`,
      });
      return;
    }

    const { data: runRec, error: runErr } = await adminClient
      .from('etl_runs')
      .insert({
        job_name:      'sql_etl_push',
        source:        'sql_etl',
        status:        'running',
        started_at:    new Date().toISOString(),
        pipeline_name: source_label,
      })
      .select()
      .single();

    if (runErr || !runRec) {
      res.status(500).json({ error: 'Failed to create ETL run for SQL target.' });
      return;
    }
    const etlRunId = runRec.id as string;

    let rowsInserted = 0;
    let rowsFailed   = 0;
    const errors: string[] = [];

    try {
      const pool = await resolvePool(connection_id);

      for (let idx = 0; idx < rows.length; idx++) {
        const row  = rows[idx]!;
        const cols = Object.keys(row).filter(
          (k) => row[k] !== undefined && row[k] !== null && row[k] !== '',
        );

        if (cols.length === 0) {
          rowsFailed++;
          errors.push(`Row ${idx + 1}: No insertable columns after filtering empty values.`);
          continue;
        }

        const colStr = cols.map((c) => `[${c}]`).join(', ');
        const params = cols.map((_, i) => `@p${idx}_${i}`).join(', ');
        const qry    = `INSERT INTO ${table_name.trim()} (${colStr}) VALUES (${params})`;

        try {
          const request = pool.request();
          cols.forEach((col, i) => {
            request.input(
              `p${idx}_${i}`,
              row[col] as sql.ISqlType | string | number | boolean | null | Date,
            );
          });
          await request.query(qry);
          rowsInserted++;
        } catch (rowErr) {
          rowsFailed++;
          errors.push(`Row ${idx + 1}: ${(rowErr as Error).message}`);
          // Stop flooding errors after first 20
          if (errors.length >= 20) break;
        }
      }

      const status = (
        rowsFailed === 0 ? 'success' : rowsInserted === 0 ? 'failed' : 'partial'
      ) as 'success' | 'partial' | 'failed';

      await adminClient.from('etl_runs').update({
        status,
        rows_processed: rowsInserted,
        rows_failed:    rowsFailed,
        finished_at:    new Date().toISOString(),
        error_message:  errors.length > 0 ? errors.slice(0, 5).join(' | ') : null,
      }).eq('id', etlRunId);

      response.sql = {
        etl_run_id:    etlRunId,
        rows_inserted: rowsInserted,
        rows_failed:   rowsFailed,
        status,
        errors:        errors.slice(0, 10),
      };
      targetStatuses.push(status);
    } catch (err) {
      console.error('[sqlEtlUpload:run:sql]', err);

      await adminClient.from('etl_runs').update({
        status:        'failed',
        rows_failed:   rows.length,
        finished_at:   new Date().toISOString(),
        error_message: (err as Error).message,
      }).eq('id', etlRunId);

      response.sql = {
        etl_run_id:    etlRunId,
        rows_inserted: 0,
        rows_failed:   rows.length,
        status:        'failed',
        errors:        [(err as Error).message],
      };
      targetStatuses.push('failed');
    }
  }

  // Compute overall status
  const allSuccess = targetStatuses.every((s) => s === 'success');
  const allFailed  = targetStatuses.every((s) => s === 'failed');
  response.status  = allSuccess ? 'success' : allFailed ? 'failed' : 'partial';

  res.status(201).json(response);
});
