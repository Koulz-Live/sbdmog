// azure-functions/src/functions/indexCheck.ts
// Timer Trigger: daily index fragmentation check and maintenance log
// Collects index fragmentation data from sys.dm_db_index_physical_stats,
// logs action taken (none/reorganize/rebuild), and reports missing index
// recommendations from sys.dm_db_missing_index_details.
//
// Default schedule: daily at 03:00 UTC (cron: "0 0 3 * * *")
// Override via app setting: INDEX_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { checkConnectivity, runQuery } from '../lib/sqlClient.js';
import { logger } from '../common/logger.js';

const FUNCTION_NAME = 'indexCheck';
const WEBHOOK_PATH  = '/webhooks/db-index-results';

// ── Index Fragmentation Query ─────────────────────────────────────────────────
// Uses LIMITED mode for speed; DETAILED would be too slow on large databases.
const INDEX_FRAG_QUERY = `
  SELECT
    OBJECT_NAME(s.object_id)              AS table_name,
    i.name                                AS index_name,
    i.type_desc                           AS index_type,
    s.index_type_desc                     AS physical_type,
    CAST(s.avg_fragmentation_in_percent AS DECIMAL(5,2)) AS fragmentation_pct,
    s.page_count,
    CASE
      WHEN s.page_count < 1000                         THEN 'skipped'
      WHEN s.avg_fragmentation_in_percent < 10         THEN 'none'
      WHEN s.avg_fragmentation_in_percent BETWEEN 10 AND 30 THEN 'reorganize'
      ELSE                                                  'rebuild'
    END AS action_recommended
  FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') s
  JOIN sys.indexes i
    ON i.object_id = s.object_id AND i.index_id = s.index_id
  JOIN sys.objects o
    ON o.object_id = s.object_id
  WHERE o.type = 'U'
    AND i.index_id > 0
  ORDER BY s.avg_fragmentation_in_percent DESC
`;

// ── Missing Index Recommendations ─────────────────────────────────────────────
const MISSING_INDEX_QUERY = `
  SELECT TOP 10
    OBJECT_NAME(d.object_id)  AS table_name,
    CAST(gs.avg_total_user_cost * gs.avg_user_impact * (gs.user_seeks + gs.user_scans) / 100.0
      AS DECIMAL(12,2))       AS impact_score,
    d.equality_columns,
    d.inequality_columns,
    d.included_columns,
    gs.user_seeks,
    gs.user_scans
  FROM sys.dm_db_missing_index_group_stats gs
  JOIN sys.dm_db_missing_index_groups g  ON g.index_group_handle = gs.group_handle
  JOIN sys.dm_db_missing_index_details d ON d.index_handle = g.index_handle
  WHERE d.database_id = DB_ID()
  ORDER BY impact_score DESC
`;

// ── Handler ───────────────────────────────────────────────────────────────────

async function indexCheckHandler(_myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt = new Date().toISOString();
  const startTime = Date.now();

  // 1. Connectivity check
  const connectivity = await checkConnectivity(sqlCfg);
  if (!connectivity.ok) {
    await deliverWebhook(webhookCfg, WEBHOOK_PATH, appCfg.environment, {
      source: 'azure-sql-connector',
      job_name: FUNCTION_NAME,
      environment: appCfg.environment,
      timestamp: checkedAt,
      payload_version: '1.0',
      data: {
        status: 'unreachable', duration_ms: 0, checked_at: checkedAt,
        index_stats: [], missing_indexes: [], error_message: connectivity.error,
      },
    });
    return;
  }

  // 2. Collect index data in parallel
  const [fragResult, missingResult] = await Promise.all([
    runQuery(sqlCfg, INDEX_FRAG_QUERY),
    runQuery(sqlCfg, MISSING_INDEX_QUERY),
  ]);

  if (fragResult.error) {
    logger.error(FUNCTION_NAME, `Index frag query failed: ${fragResult.error}`);
  }

  // 3. Compute summary statistics
  type IndexRow = {
    table_name: string;
    index_name: string;
    index_type: string;
    fragmentation_pct: number;
    page_count: number;
    action_recommended: string;
  };

  const rows = fragResult.rows as IndexRow[];

  const noneCount        = rows.filter(r => r.action_recommended === 'none').length;
  const reorganizeCount  = rows.filter(r => r.action_recommended === 'reorganize').length;
  const rebuildCount     = rows.filter(r => r.action_recommended === 'rebuild').length;
  const skippedCount     = rows.filter(r => r.action_recommended === 'skipped').length;
  const totalIndexes     = rows.length;
  const avgFrag          = rows.length > 0
    ? rows.reduce((sum, r) => sum + Number(r.fragmentation_pct ?? 0), 0) / rows.length
    : 0;

  const topFragmented = rows
    .filter(r => r.action_recommended !== 'skipped')
    .sort((a, b) => Number(b.fragmentation_pct) - Number(a.fragmentation_pct))
    .slice(0, 5);

  let status: string = 'healthy';
  if (rebuildCount > 10)     status = 'critical';
  else if (rebuildCount > 0 || reorganizeCount > 5) status = 'warnings';

  const payload = {
    source: 'azure-sql-connector',
    job_name: FUNCTION_NAME,
    environment: appCfg.environment,
    timestamp: checkedAt,
    payload_version: '1.0',
    data: {
      status,
      duration_ms:            Date.now() - startTime,
      checked_at:             checkedAt,
      index_stats:            rows,
      top_fragmented:         topFragmented,
      total_indexes:          totalIndexes,
      healthy_count:          noneCount,
      reorganized_count:      reorganizeCount,
      rebuilt_count:          rebuildCount,
      skipped_count:          skippedCount,
      avg_fragmentation_pct:  parseFloat(avgFrag.toFixed(2)),
      missing_indexes:        missingResult.rows,
      error_message:          fragResult.error ?? null,
    },
  };

  const result = await deliverWebhook(webhookCfg, WEBHOOK_PATH, appCfg.environment, payload);
  if (!result.success) {
    logger.error(FUNCTION_NAME, `Webhook delivery failed: ${result.error}`);
  } else {
    logger.info(FUNCTION_NAME, `Index check complete — status=${status} total=${totalIndexes} rebuild=${rebuildCount} reorg=${reorganizeCount}`);
  }
}

app.timer(FUNCTION_NAME, {
  schedule:     process.env['INDEX_CHECK_SCHEDULE'] ?? '0 0 3 * * *',
  runOnStartup: false,
  handler:      indexCheckHandler,
});
