// server/routes/sqlStats.ts
// GET /api/sql-stats
// Returns row counts and column-level breakdowns for all tables in the
// Azure SQL Database (dbo.backup_history and dbo.etl_job_history).
// Also reports connectivity status so the UI can show a "disconnected" badge.

import { Router }          from 'express';
import type { Response }   from 'express';
import { runQuery, checkConnectivity } from '../lib/azureSql.js';

export const sqlStatsRouter = Router();

// ─── Types returned to the client ────────────────────────────────────────────

export interface ColumnBreakdownItem {
  label: string;
  count: number;
}

export interface TableStat {
  table:       string;
  description: string;
  total_rows:  number;
  columns:     {
    name:       string;
    label:      string;
    breakdown:  ColumnBreakdownItem[];
  }[];
  last_updated: string | null;  // ISO timestamp of the most recent row
}

export interface SqlStatsResponse {
  connected:    boolean;
  latency_ms:   number;
  checked_at:   string;
  server:       string;
  database:     string;
  tables:       TableStat[];
  error:        string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeCount(rows: Record<string, unknown>[], key: string): number {
  const first = rows[0];
  if (!first) return 0;
  const v = first[key];
  return typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10);
}

// ─── Route handler ────────────────────────────────────────────────────────────

sqlStatsRouter.get('/', async (_req, res: Response) => {
  const checkedAt = new Date().toISOString();
  const server    = process.env['SQL_SERVER']   ?? '(not configured)';
  const database  = process.env['SQL_DATABASE'] ?? '(not configured)';

  // 1. Connectivity probe
  const conn = await checkConnectivity();

  if (!conn.ok) {
    const body: SqlStatsResponse = {
      connected:  false,
      latency_ms: conn.latencyMs,
      checked_at: checkedAt,
      server,
      database,
      tables:     [],
      error:      conn.error,
    };
    return res.json(body);
  }

  // 2. Run all stat queries in parallel
  const [
    // backup_history totals
    backupTotal,
    backupByType,
    backupDamaged,
    backupCompressedVsRaw,
    backupLastUpdated,

    // etl_job_history totals
    etlTotal,
    etlByStatus,
    etlByEnabled,
    etlJobNames,
    etlLastUpdated,
  ] = await Promise.all([
    runQuery('SELECT COUNT(*) AS n FROM dbo.backup_history'),

    runQuery(`
      SELECT
        CASE type
          WHEN 'D' THEN 'Full'
          WHEN 'I' THEN 'Differential'
          WHEN 'L' THEN 'Log'
          ELSE type
        END AS label,
        COUNT(*) AS n
      FROM dbo.backup_history
      GROUP BY type
      ORDER BY n DESC
    `),

    runQuery(`
      SELECT
        CASE is_damaged WHEN 1 THEN 'Damaged' ELSE 'Healthy' END AS label,
        COUNT(*) AS n
      FROM dbo.backup_history
      GROUP BY is_damaged
      ORDER BY is_damaged DESC
    `),

    runQuery(`
      SELECT
        SUM(backup_size)     AS total_raw_bytes,
        SUM(compressed_size) AS total_compressed_bytes,
        COUNT(*)             AS n
      FROM dbo.backup_history
      WHERE backup_size IS NOT NULL
    `),

    runQuery(`
      SELECT TOP 1 CONVERT(VARCHAR(30), backup_start_date, 126) AS last_updated
      FROM dbo.backup_history
      ORDER BY backup_start_date DESC
    `),

    runQuery('SELECT COUNT(*) AS n FROM dbo.etl_job_history'),

    runQuery(`
      SELECT
        CASE run_status
          WHEN 0 THEN 'Failed'
          WHEN 1 THEN 'Succeeded'
          WHEN 2 THEN 'Retry'
          WHEN 3 THEN 'Cancelled'
          WHEN 4 THEN 'Running'
          ELSE 'Unknown (' + CAST(run_status AS VARCHAR) + ')'
        END AS label,
        COUNT(*) AS n
      FROM dbo.etl_job_history
      WHERE run_status IS NOT NULL
      GROUP BY run_status
      ORDER BY n DESC
    `),

    runQuery(`
      SELECT
        CASE enabled WHEN 1 THEN 'Enabled' ELSE 'Disabled' END AS label,
        COUNT(*) AS n
      FROM dbo.etl_job_history
      GROUP BY enabled
      ORDER BY enabled DESC
    `),

    runQuery(`
      SELECT name AS label, COUNT(*) AS n
      FROM dbo.etl_job_history
      GROUP BY name
      ORDER BY n DESC
    `),

    runQuery(`
      SELECT TOP 1 CONVERT(VARCHAR(30), created_at, 126) AS last_updated
      FROM dbo.etl_job_history
      ORDER BY created_at DESC
    `),
  ]);

  // 3. Compute compression ratio for backup_history
  const rawBytes  = Number((backupCompressedVsRaw.rows[0] as Record<string, unknown>)?.['total_raw_bytes']        ?? 0);
  const compBytes = Number((backupCompressedVsRaw.rows[0] as Record<string, unknown>)?.['total_compressed_bytes'] ?? 0);
  const totalBackupGB   = rawBytes  > 0 ? parseFloat((rawBytes  / 1_073_741_824).toFixed(2)) : 0;
  const compressedGB    = compBytes > 0 ? parseFloat((compBytes / 1_073_741_824).toFixed(2)) : 0;
  const savedGB         = parseFloat((totalBackupGB - compressedGB).toFixed(2));

  // 4. Build response
  const tables: TableStat[] = [
    {
      table:       'dbo.backup_history',
      description: 'SQL backup records for Heqcis_web (Full / Differential / Log)',
      total_rows:  safeCount(backupTotal.rows, 'n'),
      columns: [
        {
          name:  'type',
          label: 'Backup Type',
          breakdown: (backupByType.rows as Record<string, unknown>[]).map((r) => ({
            label: String(r['label'] ?? ''),
            count: parseInt(String(r['n'] ?? '0'), 10),
          })),
        },
        {
          name:  'is_damaged',
          label: 'Health Status',
          breakdown: (backupDamaged.rows as Record<string, unknown>[]).map((r) => ({
            label: String(r['label'] ?? ''),
            count: parseInt(String(r['n'] ?? '0'), 10),
          })),
        },
        {
          name:  'backup_size',
          label: 'Storage (GB)',
          breakdown: [
            { label: 'Raw total',   count: totalBackupGB },
            { label: 'Compressed',  count: compressedGB  },
            { label: 'Space saved', count: savedGB        },
          ],
        },
      ],
      last_updated: (backupLastUpdated.rows[0] as Record<string, unknown> | undefined)?.['last_updated'] as string | null ?? null,
    },
    {
      table:       'dbo.etl_job_history',
      description: 'HEQCISWEB_Job run history (mirrors msdb.dbo.sysjobhistory)',
      total_rows:  safeCount(etlTotal.rows, 'n'),
      columns: [
        {
          name:  'run_status',
          label: 'Run Status',
          breakdown: (etlByStatus.rows as Record<string, unknown>[]).map((r) => ({
            label: String(r['label'] ?? ''),
            count: parseInt(String(r['n'] ?? '0'), 10),
          })),
        },
        {
          name:  'enabled',
          label: 'Job Enabled',
          breakdown: (etlByEnabled.rows as Record<string, unknown>[]).map((r) => ({
            label: String(r['label'] ?? ''),
            count: parseInt(String(r['n'] ?? '0'), 10),
          })),
        },
        {
          name:  'name',
          label: 'Job Name',
          breakdown: (etlJobNames.rows as Record<string, unknown>[]).map((r) => ({
            label: String(r['label'] ?? ''),
            count: parseInt(String(r['n'] ?? '0'), 10),
          })),
        },
      ],
      last_updated: (etlLastUpdated.rows[0] as Record<string, unknown> | undefined)?.['last_updated'] as string | null ?? null,
    },
  ];

  const body: SqlStatsResponse = {
    connected:  true,
    latency_ms: conn.latencyMs,
    checked_at: checkedAt,
    server,
    database,
    tables,
    error:      null,
  };

  return res.json(body);
});
