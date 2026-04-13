// api/webhooks/sqlCheckResults.ts
// HMAC-verified webhook for SQL health-check payloads from the Azure Functions connector.
// Signature scheme: x-heqcis-signature = sha256=HMAC-SHA256("timestamp.rawBody")
// Stores a security_finding row when any individual check is unhealthy.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminClient } from '@heqcis/supabase';
import { z } from 'zod';

const WEBHOOK_SECRET  = process.env['WEBHOOK_SECRET'] ?? '';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // reject payloads older than 5 minutes

// ── Zod schema for the Azure Functions connector envelope ─────────────────────
const sqlDetailSchema = z.object({
  check_name: z.string(),
  value:      z.union([z.string(), z.number(), z.null()]),
  unit:       z.string().nullable(),
  is_healthy: z.boolean(),
  message:    z.string().nullable(),
});

const sqlCheckSchema = z.object({
  source:          z.string(),
  job_name:        z.string(),
  environment:     z.string(),
  timestamp:       z.string(),
  payload_version: z.string(),
  data: z.object({
    status:        z.enum(['healthy', 'degraded', 'critical', 'unreachable']),
    duration_ms:   z.number(),
    checked_at:    z.string(),
    details:       z.array(sqlDetailSchema),
    error_message: z.string().nullable(),
  }),
});

// ── HMAC verification using timestamp.rawBody scheme ─────────────────────────
function verifySignature(req: Request, rawBody: string): boolean {
  const sig       = req.headers['x-heqcis-signature'] as string | undefined;
  const timestamp = req.headers['x-heqcis-timestamp'] as string | undefined;
  if (!sig || !timestamp) return false;

  // Reject stale payloads
  const sentAt = new Date(timestamp).getTime();
  if (isNaN(sentAt) || Date.now() - sentAt > MAX_CLOCK_SKEW_MS) return false;

  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function handleSqlCheckResults(req: Request, res: Response): Promise<void> {
  // Raw body is needed for signature verification; express must be configured with
  // `express.raw({ type: 'application/json' })` on this route, or we fall back to
  // re-serialising req.body (acceptable when body-parser is used globally).
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const parsed = sqlCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues });
    return;
  }

  const { data: envelope } = parsed;
  const { status, details, error_message, checked_at } = envelope.data;

  // Create a security_finding for every unhealthy individual check
  const unhealthy = details.filter(d => !d.is_healthy);
  const errors: string[] = [];

  for (const detail of unhealthy) {
    const severity = status === 'critical' ? 'critical' : status === 'degraded' ? 'high' : 'medium';
    try {
      const { error } = await adminClient.from('security_findings').insert({
        title:           `SQL Check Failed: ${detail.check_name}`,
        description:     detail.message ?? `Check returned ${String(detail.value)} ${detail.unit ?? ''}`.trim(),
        severity,
        status:          'open',
        source:          'scan',
        affected_system: envelope.source,
      });
      if (error) throw error;
    } catch (err) {
      console.error('[webhook:sqlCheck]', err);
      errors.push(detail.check_name);
    }
  }

  // Also log a finding if the connector itself errored (unreachable)
  if (error_message && status === 'unreachable') {
    try {
      await adminClient.from('security_findings').insert({
        title:           'SQL Server Unreachable',
        description:     error_message,
        severity:        'critical',
        status:          'open',
        source:          'scan',
        affected_system: envelope.source,
      });
    } catch (err) {
      console.error('[webhook:sqlCheck:unreachable]', err);
      errors.push('unreachable-finding');
    }
  }

  if (errors.length > 0) {
    res.status(500).json({ error: 'Some findings failed to persist.', failed_checks: errors });
    return;
  }

  res.status(200).json({
    received:        true,
    status,
    findings_created: unhealthy.length,
    checked_at,
  });
}
