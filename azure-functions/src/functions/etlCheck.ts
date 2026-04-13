// azure-functions/src/functions/etlCheck.ts
// Timer Trigger: runs ETL health checks on a configurable schedule
// and delivers HMAC-signed results to the Vercel API webhook endpoint.
//
// Default schedule: every 15 minutes (cron: "0 */15 * * * *")
// Override via app setting: ETL_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { runEtlCheck } from '../lib/etlClient.js';
import { logger } from '../common/logger.js';
import type { EtlWebhookPayload } from '../common/types.js';

const FUNCTION_NAME = 'etlCheck';
const WEBHOOK_PATH  = '/webhooks/etl-results';

// ─── Function handler ─────────────────────────────────────────────────────────

async function etlCheckHandler(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt = new Date().toISOString();

  logger.info(FUNCTION_NAME, `Starting ETL check for job "${sqlCfg.etlJobName}"`);

  const etlResult = await runEtlCheck(sqlCfg);

  logger.info(
    FUNCTION_NAME,
    `ETL check complete: status=${etlResult.status}, restartRequired=${etlResult.restart_required}`,
  );

  if (etlResult.restart_required) {
    logger.warn(FUNCTION_NAME, `ETL job "${etlResult.job_name}" requires manual restart`);
  }

  const payload: EtlWebhookPayload = {
    source:          'azure-etl-connector',
    job_name:        FUNCTION_NAME,
    environment:     appCfg.environment,
    timestamp:       checkedAt,
    payload_version: '1.0',
    data:            etlResult,
  };

  const delivery = await deliverWebhook(webhookCfg, WEBHOOK_PATH, 'azure-etl-connector', payload);

  if (!delivery.success) {
    logger.error(FUNCTION_NAME, `Webhook delivery failed: ${delivery.error}`);
  } else {
    logger.info(FUNCTION_NAME, `Webhook delivered: attempt=${delivery.attempt}, status=${delivery.status_code}`);
  }

  if (myTimer.isPastDue) {
    context.log(`[${FUNCTION_NAME}] Timer was past due`);
  }
}

// ─── Function registration ────────────────────────────────────────────────────

const schedule = process.env['ETL_CHECK_SCHEDULE'] ?? '0 */15 * * * *';

app.timer(FUNCTION_NAME, {
  schedule,
  runOnStartup: false,
  handler: etlCheckHandler,
});
