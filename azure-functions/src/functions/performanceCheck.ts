// azure-functions/src/functions/performanceCheck.ts
// Timer Trigger: daily database performance check
// Collects SQL Server DMV data: wait stats, slow queries, blocking chains,
// resource pressure metrics. Signs results and delivers to Vercel webhook.
//
// Default schedule: daily at 06:00 UTC  (cron: "0 0 6 * * *")
// Override via app setting: PERF_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { checkConnectivity, runQuery } from '../lib/sqlClient.js';
import { logger } from '../common/logger.js';

const FUNCTION_NAME = 'performanceCheck';
const WEBHOOK_PATH  = '/webhooks/db-performance-results';

// ── DMV Queries (read-only) ───────────────────────────────────────────────────

const WAIT_STATS_QUERY = `
  SELECT TOP 10
    wait_type,
    waiting_tasks_count                                                   AS waiting_tasks,
    wait_time_ms,
    signal_wait_time_ms                                                   AS signal_wait_ms,
    CAST(wait_time_ms * 100.0 / NULLIF(SUM(wait_time_ms) OVER (), 0)
         AS DECIMAL(5,2))                                                 AS pct_of_total
  FROM sys.dm_os_wait_stats
  WHERE wait_type NOT IN (
    'SLEEP_TASK','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT',
    'HADR_WORK_QUEUE','LAZYWRITER_SLEEP','LOGMGR_QUEUE','ONDEMAND_TASK_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH','RESOURCE_QUEUE','SERVER_IDLE_CHECK',
    'SLEEP_DBSTARTUP','SLEEP_DCOMSTARTUP','SLEEP_MASTERDBREADY',
    'SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED','SLEEP_MSDBSTARTUP',
    'SLEEP_TEMPDBSTARTUP','SNI_HTTP_ACCEPT','SP_SERVER_DIAGNOSTICS_SLEEP',
    'SQLTRACE_BUFFER_FLUSH','SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
    'WAIT_XTP_OFFLINE_CKPT_NEW_LOG','XE_DISPATCHER_IDLE','XE_TIMER_EVENT',
    'WAITFOR','BROKER_EVENTHANDLER','CHECKPOINT_QUEUE','DBMIRROR_EVENTS_QUEUE',
    'SQLTRACE_WAIT_ENTRIES','WAIT_XTP_OFFLINE_CKPT_NEW_LOG'
  )
  AND wait_time_ms > 0
  ORDER BY wait_time_ms DESC
`;

const SLOW_QUERIES_QUERY = `
  SELECT TOP 10
    qs.total_elapsed_time / qs.execution_count / 1000 AS avg_duration_ms,
    qs.execution_count,
    qs.total_logical_reads / qs.execution_count       AS avg_logical_reads,
    qs.total_worker_time / qs.execution_count / 1000  AS avg_cpu_ms,
    CONVERT(NVARCHAR(MAX), qp.query_plan)              AS query_plan_xml,
    SUBSTRING(st.text, (qs.statement_start_offset/2)+1,
      ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
        ELSE qs.statement_end_offset END - qs.statement_start_offset)/2)+1
    )                                                  AS query_text
  FROM sys.dm_exec_query_stats qs
  CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
  CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
  WHERE qs.execution_count > 0
    AND st.text NOT LIKE '%sys.dm_exec%'
  ORDER BY avg_duration_ms DESC
`;

const BLOCKING_QUERY = `
  SELECT
    blocking_session_id                                   AS blocking_spid,
    session_id                                            AS blocked_spid,
    wait_time / 1000                                      AS wait_time_ms,
    SUBSTRING(st.text, (r.statement_start_offset/2)+1,
      ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(st.text)
        ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1
    )                                                     AS blocked_query
  FROM sys.dm_exec_requests r
  CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
  WHERE blocking_session_id != 0
`;

const RESOURCE_QUERY = `
  SELECT
    (SELECT SUM(runnable_tasks_count) FROM sys.dm_os_schedulers
      WHERE status = 'VISIBLE ONLINE') AS runnable_tasks,
    (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) AS active_connections,
    (SELECT COUNT(*) FROM sys.dm_exec_requests r
      WHERE r.status != 'background'
        AND DATEDIFF(SECOND, r.start_time, GETUTCDATE()) > 300) AS long_running_count,
    (SELECT SUM(cntr_value) FROM sys.dm_os_performance_counters
      WHERE counter_name = 'Page life expectancy') AS page_life_expectancy_s
`;

const DISK_IO_QUERY = `
  SELECT
    DB_NAME(vfs.database_id) AS db_name,
    AVG(vfs.io_stall_read_ms * 1.0 / NULLIF(vfs.num_of_reads,0))  AS avg_read_stall_ms,
    AVG(vfs.io_stall_write_ms * 1.0 / NULLIF(vfs.num_of_writes,0)) AS avg_write_stall_ms
  FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
  WHERE DB_NAME(vfs.database_id) = DB_NAME()
  GROUP BY vfs.database_id
`;

// ── Handler ───────────────────────────────────────────────────────────────────

async function performanceCheckHandler(_myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt  = new Date().toISOString();
  const startTime  = Date.now();
  let overallStatus: string = 'healthy';
  let errorMessage: string | null = null;

  // 1. Connectivity
  const connectivity = await checkConnectivity(sqlCfg);
  if (!connectivity.ok) {
    overallStatus = 'unreachable';
    errorMessage  = connectivity.error;
    logger.error(FUNCTION_NAME, `SQL connectivity failed: ${errorMessage}`);

    await deliverWebhook(webhookCfg, WEBHOOK_PATH, appCfg.environment, {
      source: 'azure-sql-connector',
      job_name: FUNCTION_NAME,
      environment: appCfg.environment,
      timestamp: checkedAt,
      payload_version: '1.0',
      data: {
        status: overallStatus,
        duration_ms: Date.now() - startTime,
        checked_at: checkedAt,
        wait_stats: [],
        slow_queries: [],
        blocking: [],
        resource: null,
        disk_io: null,
        error_message: errorMessage,
      },
    });
    return;
  }

  // 2. Collect metrics in parallel
  const [waitResult, slowResult, blockResult, resourceResult, diskResult] = await Promise.all([
    runQuery(sqlCfg, WAIT_STATS_QUERY),
    runQuery(sqlCfg, SLOW_QUERIES_QUERY),
    runQuery(sqlCfg, BLOCKING_QUERY),
    runQuery(sqlCfg, RESOURCE_QUERY),
    runQuery(sqlCfg, DISK_IO_QUERY),
  ]);

  const blockingChains = blockResult.rows;
  const resource       = resourceResult.rows[0] ?? {};
  const longRunning    = Number(resource['long_running_count'] ?? 0);
  const diskRow        = diskResult.rows[0] ?? {};
  const avgReadMs      = Number(diskRow['avg_read_stall_ms'] ?? 0);
  const avgWriteMs     = Number(diskRow['avg_write_stall_ms'] ?? 0);

  // Determine status
  if (blockingChains.length > 5 || longRunning > 3) {
    overallStatus = 'critical';
  } else if (blockingChains.length > 0 || longRunning > 0 || avgReadMs > 50 || avgWriteMs > 50) {
    overallStatus = 'degraded';
  }

  const payload = {
    source: 'azure-sql-connector',
    job_name: FUNCTION_NAME,
    environment: appCfg.environment,
    timestamp: checkedAt,
    payload_version: '1.0',
    data: {
      status:            overallStatus,
      duration_ms:       Date.now() - startTime,
      checked_at:        checkedAt,
      wait_stats:        waitResult.rows,
      slow_queries:      slowResult.rows.map(r => ({
        ...r,
        query_text: String(r['query_text'] ?? '').slice(0, 500),
        query_plan_xml: undefined, // strip large plan XML from webhook
      })),
      blocking:          blockingChains,
      resource: {
        active_connections:    Number(resource['active_connections'] ?? 0),
        long_running_count:    longRunning,
        page_life_expectancy_s: Number(resource['page_life_expectancy_s'] ?? 0),
        runnable_tasks:        Number(resource['runnable_tasks'] ?? 0),
      },
      disk_io: {
        avg_read_stall_ms:  avgReadMs,
        avg_write_stall_ms: avgWriteMs,
      },
      error_message: null,
    },
  };

  const result = await deliverWebhook(webhookCfg, WEBHOOK_PATH, appCfg.environment, payload);
  if (!result.success) {
    logger.error(FUNCTION_NAME, `Webhook delivery failed: ${result.error}`);
  } else {
    logger.info(FUNCTION_NAME, `Performance check completed — status=${overallStatus}`);
  }
}

app.timer(FUNCTION_NAME, {
  schedule:      process.env['PERF_CHECK_SCHEDULE'] ?? '0 0 6 * * *',
  runOnStartup:  false,
  handler:       performanceCheckHandler,
});
