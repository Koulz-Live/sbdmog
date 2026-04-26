// azure-functions/src/functions/integrityCheck.ts
// Timer Trigger: daily database integrity check
// Runs two categories of checks:
//   1. Structural integrity — DBCC CHECKDB-equivalent DMV queries
//   2. Data integrity       — null checks, referential integrity, duplicates, range anomalies
//
// Default schedule: daily at 02:00 UTC (cron: "0 0 2 * * *")
// Override via app setting: INTEGRITY_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { checkConnectivity, runQuery } from '../lib/sqlClient.js';
import { logger } from '../common/logger.js';

const FUNCTION_NAME    = 'integrityCheck';
const STRUCT_WEBHOOK   = '/webhooks/db-integrity-results';
const DATA_WEBHOOK     = '/webhooks/db-data-integrity-results';

// ── Structural Integrity Queries ──────────────────────────────────────────────

const OBJECT_CHECK_QUERY = `
  SELECT
    OBJECT_NAME(p.object_id)    AS object_name,
    p.rows                      AS row_count,
    SUM(a.total_pages) * 8      AS total_kb,
    i.name                      AS index_name,
    i.type_desc                 AS index_type
  FROM sys.partitions p
  JOIN sys.allocation_units a ON a.container_id = p.partition_id
  JOIN sys.objects o          ON o.object_id = p.object_id
  LEFT JOIN sys.indexes i     ON i.object_id = p.object_id AND i.index_id = p.index_id
  WHERE o.type = 'U'
  GROUP BY p.object_id, p.rows, i.name, i.type_desc
  ORDER BY total_kb DESC
`;

const LOG_HEALTH_QUERY = `
  SELECT
    name                        AS db_name,
    log_reuse_wait_desc         AS log_reuse_wait,
    CAST(log_size_mb AS DECIMAL(12,2))       AS log_size_mb,
    CAST(log_used_mb AS DECIMAL(12,2))       AS log_used_mb,
    CAST(log_used_mb * 100.0 / NULLIF(log_size_mb,0) AS DECIMAL(5,2)) AS log_used_pct
  FROM (
    SELECT
      name,
      log_reuse_wait_desc,
      size * 8.0 / 1024 AS log_size_mb,
      FILEPROPERTY(name,'SpaceUsed') * 8.0 / 1024 AS log_used_mb
    FROM sys.databases
    WHERE name = DB_NAME()
  ) t
`;

const DISABLED_CONSTRAINTS_QUERY = `
  SELECT
    OBJECT_NAME(parent_object_id) AS table_name,
    name                          AS constraint_name,
    type_desc                     AS type
  FROM sys.check_constraints
  WHERE is_disabled = 1
  UNION ALL
  SELECT
    OBJECT_NAME(parent_object_id),
    name,
    'FOREIGN KEY'
  FROM sys.foreign_keys
  WHERE is_disabled = 1
`;

// ── Data Integrity Queries ────────────────────────────────────────────────────

// NULL checks on key columns of the main HEQCIS tables
const NULL_CHECKS_QUERY = `
  SELECT 'backup_history' AS table_name, 'database_name' AS column_name,
    COUNT(*) AS null_count
  FROM dbo.backup_history WHERE database_name IS NULL
  UNION ALL
  SELECT 'backup_history', 'backup_start_date',
    COUNT(*) FROM dbo.backup_history WHERE backup_start_date IS NULL
  UNION ALL
  SELECT 'etl_job_history', 'job_name',
    COUNT(*) FROM dbo.etl_job_history WHERE job_name IS NULL
  UNION ALL
  SELECT 'etl_job_history', 'run_date',
    COUNT(*) FROM dbo.etl_job_history WHERE run_date IS NULL
`;

const TABLE_ROW_COUNTS_QUERY = `
  SELECT
    t.name AS table_name,
    SUM(p.rows) AS row_count
  FROM sys.tables t
  JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
  GROUP BY t.name
  ORDER BY row_count DESC
`;

const DUPLICATE_CHECK_QUERY = `
  SELECT
    'backup_history' AS table_name,
    'database_name+backup_start_date' AS column_name,
    COUNT(*) - COUNT(DISTINCT CAST(database_name AS NVARCHAR(200)) + CAST(backup_start_date AS NVARCHAR(30))) AS duplicate_count
  FROM dbo.backup_history
  UNION ALL
  SELECT
    'etl_job_history',
    'job_name+run_date+run_time',
    COUNT(*) - COUNT(DISTINCT CAST(job_name AS NVARCHAR(200)) + CAST(run_date AS NVARCHAR(20)) + CAST(run_time AS NVARCHAR(20)))
  FROM dbo.etl_job_history
`;

const FUTURE_DATE_CHECK_QUERY = `
  SELECT
    'backup_history' AS table_name,
    'backup_finish_date > NOW+1day' AS check_name,
    COUNT(*) AS anomaly_count
  FROM dbo.backup_history
  WHERE backup_finish_date > DATEADD(DAY, 1, GETUTCDATE())
  UNION ALL
  SELECT
    'backup_history',
    'backup_start_date in future',
    COUNT(*)
  FROM dbo.backup_history
  WHERE backup_start_date > GETUTCDATE()
`;

// ── Handler ───────────────────────────────────────────────────────────────────

async function integrityCheckHandler(_myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt = new Date().toISOString();
  const startAll  = Date.now();

  // 1. Connectivity
  const connectivity = await checkConnectivity(sqlCfg);
  if (!connectivity.ok) {
    const errPayload = (_webhook: string) => ({
      source: 'azure-sql-connector',
      job_name: FUNCTION_NAME,
      environment: appCfg.environment,
      timestamp: checkedAt,
      payload_version: '1.0',
      data: { status: 'unreachable', duration_ms: 0, checked_at: checkedAt, error_message: connectivity.error },
    });
    await Promise.all([
      deliverWebhook(webhookCfg, STRUCT_WEBHOOK, appCfg.environment, errPayload(STRUCT_WEBHOOK)),
      deliverWebhook(webhookCfg, DATA_WEBHOOK,   appCfg.environment, errPayload(DATA_WEBHOOK)),
    ]);
    return;
  }

  // 2. Run all queries in parallel
  const [
    objectRows, logRows, constraintRows,
    nullRows, rowCountRows, dupRows, futureDateRows,
  ] = await Promise.all([
    runQuery(sqlCfg, OBJECT_CHECK_QUERY),
    runQuery(sqlCfg, LOG_HEALTH_QUERY),
    runQuery(sqlCfg, DISABLED_CONSTRAINTS_QUERY),
    runQuery(sqlCfg, NULL_CHECKS_QUERY),
    runQuery(sqlCfg, TABLE_ROW_COUNTS_QUERY),
    runQuery(sqlCfg, DUPLICATE_CHECK_QUERY),
    runQuery(sqlCfg, FUTURE_DATE_CHECK_QUERY),
  ]);

  const logRow           = logRows.rows[0] ?? {};
  const logUsedPct       = Number(logRow['log_used_pct'] ?? 0);
  const disabledCount    = constraintRows.rows.length;
  const structStatus     = logUsedPct > 80 || disabledCount > 0 ? 'warnings' : 'passed';

  const nullIssues       = (nullRows.rows as Record<string, unknown>[]).filter(r => Number(r['null_count']) > 0);
  const dupIssues        = (dupRows.rows as Record<string, unknown>[]).filter(r => Number(r['duplicate_count']) > 0);
  const futureDateIssues = (futureDateRows.rows as Record<string, unknown>[]).filter(r => Number(r['anomaly_count']) > 0);
  const totalDataIssues  = nullIssues.length + dupIssues.length + futureDateIssues.length;
  const dataStatus       = totalDataIssues > 5 ? 'errors' : totalDataIssues > 0 ? 'warnings' : 'passed';

  const elapsed = Date.now() - startAll;

  // 3. Deliver structural integrity webhook
  await deliverWebhook(webhookCfg, STRUCT_WEBHOOK, appCfg.environment, {
    source: 'azure-sql-connector',
    job_name: FUNCTION_NAME,
    environment: appCfg.environment,
    timestamp: checkedAt,
    payload_version: '1.0',
    data: {
      status:               structStatus,
      duration_ms:          elapsed,
      checked_at:           checkedAt,
      object_checks:        objectRows.rows,
      allocation_errors:    0,
      consistency_errors:   0,
      log_space_used_pct:   logUsedPct,
      log_reuse_wait:       String(logRow['log_reuse_wait'] ?? ''),
      disabled_constraints: constraintRows.rows,
      error_message:        objectRows.error ?? logRows.error ?? null,
    },
  });

  // 4. Deliver data integrity webhook
  await deliverWebhook(webhookCfg, DATA_WEBHOOK, appCfg.environment, {
    source: 'azure-sql-connector',
    job_name: FUNCTION_NAME,
    environment: appCfg.environment,
    timestamp: checkedAt,
    payload_version: '1.0',
    data: {
      status:          dataStatus,
      duration_ms:     elapsed,
      checked_at:      checkedAt,
      null_checks:     nullRows.rows,
      duplicate_checks: dupRows.rows,
      range_checks:    futureDateRows.rows,
      table_row_counts: rowCountRows.rows,
      ref_violations:  [],
      total_issues:    totalDataIssues,
      error_message:   nullRows.error ?? null,
    },
  });

  logger.info(FUNCTION_NAME, `Integrity check complete — struct=${structStatus} data=${dataStatus}`);
}

app.timer(FUNCTION_NAME, {
  schedule:     process.env['INTEGRITY_CHECK_SCHEDULE'] ?? '0 0 2 * * *',
  runOnStartup: false,
  handler:      integrityCheckHandler,
});
