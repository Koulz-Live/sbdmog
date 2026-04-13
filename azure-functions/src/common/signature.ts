// azure-functions/src/common/signature.ts
// HMAC-SHA256 signing helper for outgoing webhook payloads.
// The Vercel API (api/webhooks/*) verifies these headers on ingest.

import { createHmac, timingSafeEqual } from 'crypto';

const ALGORITHM = 'sha256';

/**
 * Produce an HMAC-SHA256 hex digest of the payload body using the shared secret.
 * Identical logic must be reproduced in the Vercel webhook receivers.
 */
export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  const message = `${timestamp}.${rawBody}`;
  return createHmac(ALGORITHM, secret).update(message, 'utf8').digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Use this in the Vercel receiver to validate incoming signatures.
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  providedSignature: string,
): boolean {
  const expected = signPayload(secret, timestamp, rawBody);
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(providedSignature, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Build the full set of HEQCIS webhook headers.
 */
export function buildSignatureHeaders(
  secret: string,
  source: string,
  rawBody: string,
): Record<string, string> {
  const timestamp = new Date().toISOString();
  const signature = signPayload(secret, timestamp, rawBody);
  return {
    'x-heqcis-signature':  `sha256=${signature}`,
    'x-heqcis-timestamp':  timestamp,
    'x-heqcis-source':     source,
  };
}
