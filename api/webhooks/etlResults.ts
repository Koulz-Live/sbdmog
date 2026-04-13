// api/webhooks/etlResults.ts
// HMAC-verified webhook for ETL-check payloads from the Azure Functions connector.
// Signature scheme: x-heqcis-signature = sha256=HMAC-SHA256("timestamp.rawBody")
// Upserts an etl_run row and creates a security_finding when ETL is stale or failed.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminClient } from '@heqcis/supabase';
import { z } from 'zod';

const WEBHOOK_SECRET    = process.env['WEBHOOK_SECRET'] ?? '';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ── Zod schema for the Azure Functions connector envelope ─────────────────────
const etlCheckSchema = z.object({
  source:          z.string(),
  job_name:        z.string(),
  environment:     z.string(),
  timestamp:       z.string(),
  payload_version: z.string(),
  data: z.object({
    status:          z.enum(['success', 'running', 'stale', 'failed', 'unknown']),
    job_name:        z.string(),
    last_success_at: z.string().nullable(),
    last_failure_at: z.string().nullable(),
    restart_required:z.boolean(),
    backlog_rows:    z.number().nullable(),
    rows_processed:  z.number().nullable(),
    rows_failed:     z.number().nullable(),
    failure_reason:  z.string().nullable(),
    notes:           z.string().nullable(),
    checked_at:      z.string(),
  }),
});

// ── HMAC verification ─────────────────────────────────────────────────────────
function verifySignature(req: Request, rawBody: string): boolean {
  const sig       = req.headers['x-heqcis-signature'] as string | undefined;
  const timestamp = req.headers['x-heqcis-timestamp'] as string | undefined;
  if (!sig || !timestamp) return false;

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

export async function handleEtlResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const parsed = etlCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues });
    return;
  }

  const { data: envelope } = parsed;
  const d = envelope.data;

  // Persist the ETL run
  try {
    const { error } = await adminClient.from('etl_runs').insert({
      job_name:       d.job_name,
      status:         d.status,
      started_at:     d.last_success_at ?? d.checked_at,
      finished_at:    d.last_success_at,
      rows_processed: d.rows_processed,
      rows_failed:    d.rows_failed,
      error_message:  d.failure_reason,
      triggered_by:   envelope.source,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[webhook:etlResults:insert]', err);
    res.status(500).json({ error: 'Failed to persist ETL run.' });
    return;
  }

  // Create a security finding for stale or failed ETL — especially restart_required
  if (d.status === 'failed' || d.status === 'stale') {
    const severity = d.status === 'failed' ? 'high' : 'medium';
    const description = [
      d.failure_reason,
      d.notes,
      d.restart_required ? `Job requires manual restart (${d.job_name}).` : null,
    ].filter(Boolean).join(' ') || `ETL status: ${d.status}`;

    try {
      await adminClient.from('security_findings').insert({
        title:           `ETL ${d.status.toUpperCase()}: ${d.job_name}`,
        description,
        severity,
        status:          'open',
        source:          'scan',
        affected_system: envelope.source,
      });
    } catch (err) {
      console.error('[webhook:etlResults:finding]', err);
      // Non-fatal — the run was already stored
    }
  }

  res.status(201).json({ received: true, status: d.status, checked_at: d.checked_at });
}

