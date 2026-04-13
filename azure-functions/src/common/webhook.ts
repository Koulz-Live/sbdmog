// azure-functions/src/common/webhook.ts
// Retry-safe webhook POST helper.
// Signs payloads with HMAC-SHA256 and delivers them to the Vercel API.

import { buildSignatureHeaders } from './signature.js';
import { httpRequest } from './http.js';
import { logger } from './logger.js';
import type { WebhookConfig } from './config.js';
import type { WebhookDeliveryResult } from './types.js';

const CONTEXT = 'webhook';

/**
 * POST a JSON payload to a Vercel webhook endpoint with HMAC signature headers.
 * Implements linear-backoff retry up to config.maxRetries attempts.
 */
export async function deliverWebhook<T>(
  config: WebhookConfig,
  path: string,
  source: string,
  payload: T,
): Promise<WebhookDeliveryResult> {
  const url      = `${config.baseUrl}${path}`;
  const rawBody  = JSON.stringify(payload);
  const sigHdrs  = buildSignatureHeaders(config.secret, source, rawBody);

  const headers: Record<string, string> = {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(rawBody, 'utf8').toString(),
    ...sigHdrs,
  };

  logger.info(CONTEXT, `Delivering webhook to ${url} (source=${source})`);

  let lastError: string | null = null;
  let lastStatus: number | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    const start = Date.now();

    try {
      const response = await httpRequest(url, {
        method:    'POST',
        headers,
        body:      rawBody,
        timeoutMs: config.timeoutMs,
      });

      const duration_ms = Date.now() - start;

      if (response.ok) {
        logger.info(CONTEXT, `Webhook delivered successfully (attempt=${attempt}, status=${response.status}, ms=${duration_ms})`);
        return { success: true, status_code: response.status, attempt, duration_ms, error: null };
      }

      lastStatus = response.status;
      lastError  = `HTTP ${response.status}: ${response.body.slice(0, 200)}`;
      logger.warn(CONTEXT, `Webhook attempt ${attempt}/${config.maxRetries} failed: ${lastError}`);

    } catch (err: unknown) {
      const duration_ms = Date.now() - start;
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn(CONTEXT, `Webhook attempt ${attempt}/${config.maxRetries} threw: ${lastError} (ms=${duration_ms})`);
    }

    if (attempt < config.maxRetries) {
      const delay = config.retryDelayMs * attempt;
      logger.info(CONTEXT, `Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  logger.error(CONTEXT, `All ${config.maxRetries} webhook attempts failed for ${url}`, lastError);
  return {
    success:     false,
    status_code: lastStatus,
    attempt:     config.maxRetries,
    duration_ms: 0,
    error:       lastError,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
