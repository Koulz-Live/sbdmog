// azure-functions/src/functions/backupCheck.ts
// Timer Trigger: runs backup health checks on a configurable schedule
// and delivers HMAC-signed results to the Vercel API webhook endpoint.
//
// Default schedule: every 4 hours (cron: "0 0 */4 * * *")
// Override via app setting: BACKUP_CHECK_SCHEDULE

import { app, InvocationContext, Timer } from '@azure/functions';
import { getWebhookConfig, getSqlConfig, getAppConfig } from '../common/config.js';
import { deliverWebhook } from '../common/webhook.js';
import { runBackupCheck } from '../lib/backupClient.js';
import { logger } from '../common/logger.js';
import type { BackupWebhookPayload } from '../common/types.js';

const FUNCTION_NAME = 'backupCheck';
const WEBHOOK_PATH  = '/webhooks/backup-results';

// ─── Function handler ─────────────────────────────────────────────────────────

async function backupCheckHandler(myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log(`[${FUNCTION_NAME}] Timer fired at ${new Date().toISOString()}`);

  const appCfg     = getAppConfig();
  const sqlCfg     = getSqlConfig();
  const webhookCfg = getWebhookConfig();

  const checkedAt = new Date().toISOString();

  logger.info(FUNCTION_NAME, 'Starting backup health check');

  const backupResult = await runBackupCheck(sqlCfg);

  logger.info(FUNCTION_NAME, `Backup check complete: status=${backupResult.status}, noinit=${backupResult.noinit_risk_detected}`);

  const payload: BackupWebhookPayload = {
    source:          'azure-backup-connector',
    job_name:        FUNCTION_NAME,
    environment:     appCfg.environment,
    timestamp:       checkedAt,
    payload_version: '1.0',
    data:            backupResult,
  };

  const delivery = await deliverWebhook(webhookCfg, WEBHOOK_PATH, 'azure-backup-connector', payload);

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

const schedule = process.env['BACKUP_CHECK_SCHEDULE'] ?? '0 0 */4 * * *';

app.timer(FUNCTION_NAME, {
  schedule,
  runOnStartup: false,
  handler: backupCheckHandler,
});
