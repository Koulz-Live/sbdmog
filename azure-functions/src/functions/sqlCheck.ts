// azure-functions/src/functions/sqlCheck.ts
// Timer Trigger: runs SQL health checks on a configurable schedule
// and delivers HMAC-signed results to the Vercel API webhook endpoint.
//
// Default schedule: every 30 minutes (cron: "0 */30 * * * *")
// Override via app setting: SQL_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { checkConnectivity, runQuery } from '../lib/sqlClient.js';
import { logger } from '../common/logger.js';
import type { SqlCheckWebhookPayload, SqlCheckResult, SqlCheckDetail } from '../common/types.js';

const FUNCTION_NAME = 'sqlCheck';
const WEBHOOK_PATH  = '/webhooks/sql-check-results';

// ─── Sample diagnostic queries ────────────────────────────────────────────────
// Replace or extend these with HEQCIS-specific checks as the environment
// is better understood. All queries must be read-only.

const DIAGNOSTIC_QUERIES: Array<{ name: string; query: string; unit: string | null }> = [
  {
    name:  'connectivity_check',
    query: 'SELECT 1 AS value',
    unit:  null,
  },
  {
    name:  'active_connections',
    query: `SELECT COUNT(*) AS value FROM sys.dm_exec_sessions WHERE is_user_process = 1`,
    unit:  'connections',
  },
  {
    name:  'database_size_mb',
    query: `
      SELECT CAST(SUM(size) * 8.0 / 1024 AS INT) AS value
      FROM sys.database_files
      WHERE type_desc = 'ROWS'
    `,
    unit: 'MB',
  },
  {
    name:  'log_space_pct',
    query: `
      SELECT CAST(log_reuse_wait_desc AS VARCHAR(50)) AS value
      FROM sys.databases
      WHERE name = DB_NAME()
    `,
    unit: null,
  },
  {
    name:  'long_running_queries',
    query: `
      SELECT COUNT(*) AS value
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.status != 'background'
        AND DATEDIFF(SECOND, r.start_time, GETUTCDATE()) > 300
    `,
    unit: 'queries_over_5min',
  },
];

// ─── Function handler ─────────────────────────────────────────────────────────

async function sqlCheckHandler(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt  = new Date().toISOString();
  const details: SqlCheckDetail[] = [];
  let overallStatus: SqlCheckResult['status'] = 'healthy';
  let errorMessage: string | null = null;

  // 1. Connectivity check first
  const connectivity = await checkConnectivity(sqlCfg);
  details.push({
    check_name: 'connectivity',
    value:      connectivity.ok ? 'reachable' : 'unreachable',
    unit:       null,
    is_healthy: connectivity.ok,
    message:    connectivity.error,
  });

  if (!connectivity.ok) {
    overallStatus = 'failed';
    errorMessage  = connectivity.error;
    logger.error(FUNCTION_NAME, `SQL connectivity failed: ${errorMessage}`);
  } else {
    // 2. Run diagnostic queries
    for (const diag of DIAGNOSTIC_QUERIES) {
      if (diag.name === 'connectivity_check') continue; // already done

      const result = await runQuery(sqlCfg, diag.query);

      if (result.error !== null) {
        details.push({
          check_name: diag.name,
          value:      null,
          unit:       diag.unit,
          is_healthy: false,
          message:    result.error,
        });
        if (overallStatus === 'healthy') overallStatus = 'degraded';
      } else {
        const firstRow = result.rows[0];
        const rawValue = firstRow ? Object.values(firstRow)[0] : null;
        const value    = rawValue != null ? String(rawValue) : null;

        // Simple threshold: flag long-running queries
        let is_healthy = true;
        if (diag.name === 'long_running_queries' && Number(rawValue) > 0) {
          is_healthy    = false;
          overallStatus = 'degraded';
        }

        details.push({
          check_name: diag.name,
          value:      rawValue as string | number | null,
          unit:       diag.unit,
          is_healthy,
          message:    is_healthy ? null : `Value "${value}" exceeded threshold for check "${diag.name}"`,
        });
      }
    }
  }

  const overallDuration = details.reduce((sum, _d) => sum, 0); // actual timing handled per-query

  const sqlCheckResult: SqlCheckResult = {
    status:      overallStatus,
    duration_ms: connectivity.duration_ms,
    checked_at:  checkedAt,
    details,
    error_message: errorMessage,
  };

  const payload: SqlCheckWebhookPayload = {
    source:          'azure-sql-connector',
    job_name:        FUNCTION_NAME,
    environment:     appCfg.environment,
    timestamp:       checkedAt,
    payload_version: '1.0',
    data:            sqlCheckResult,
  };

  logger.info(FUNCTION_NAME, `SQL check complete: status=${overallStatus}, checks=${details.length}`);
  void overallDuration; // suppress unused var

  const delivery = await deliverWebhook(webhookCfg, WEBHOOK_PATH, 'azure-sql-connector', payload);

  if (!delivery.success) {
    logger.error(FUNCTION_NAME, `Webhook delivery failed: ${delivery.error}`);
    // Do not throw — let the function complete so Azure Functions does not retry
    // the entire timer execution. The next timer tick will retry the check.
  } else {
    logger.info(FUNCTION_NAME, `Webhook delivered: attempt=${delivery.attempt}, status=${delivery.status_code}`);
  }

  if (myTimer.isPastDue) {
    context.log(`[${FUNCTION_NAME}] Timer was past due`);
  }
}

// ─── Function registration ────────────────────────────────────────────────────

const schedule = process.env['SQL_CHECK_SCHEDULE'] ?? '0 */30 * * * *';

app.timer(FUNCTION_NAME, {
  schedule,
  runOnStartup: false,
  handler: sqlCheckHandler,
});
