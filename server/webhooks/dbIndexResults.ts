// server/webhooks/dbIndexResults.ts
// HMAC-verified webhook for index fragmentation / maintenance payloads from Azure Functions.
// Persists each run to db_index_logs, triggers AI analysis, and
// auto-creates a security_finding when critical fragmentation is detected.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminClient } from '@heqcis/supabase';
import { z } from 'zod';

const WEBHOOK_SECRET    = process.env['WEBHOOK_SECRET'] ?? '';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function verifySignature(req: Request, rawBody: string): boolean {
  const sig       = req.headers['x-heqcis-signature'] as string | undefined;
  const timestamp = req.headers['x-heqcis-timestamp'] as string | undefined;
  if (!sig || !timestamp) return false;
  const sentAt = new Date(timestamp).getTime();
  if (isNaN(sentAt) || Date.now() - sentAt > MAX_CLOCK_SKEW_MS) return false;
  const expected = 'sha256=' + createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}

const indexCheckSchema = z.object({
  source: z.string(), job_name: z.string(), environment: z.string(),
  timestamp: z.string(), payload_version: z.string(),
  data: z.object({
    status:               z.enum(['healthy', 'warnings', 'critical', 'unreachable', 'unknown']),
    duration_ms:          z.number(),
    checked_at:           z.string(),
    index_stats:          z.array(z.record(z.unknown())).optional().default([]),
    top_fragmented:       z.array(z.record(z.unknown())).optional().default([]),
    total_indexes:        z.number().optional().default(0),
    healthy_count:        z.number().optional().default(0),
    reorganized_count:    z.number().optional().default(0),
    rebuilt_count:        z.number().optional().default(0),
    skipped_count:        z.number().optional().default(0),
    avg_fragmentation_pct: z.number().optional().default(0),
    missing_indexes:      z.array(z.record(z.unknown())).optional().default([]),
    error_message:        z.string().nullable(),
  }),
});

export async function handleDbIndexResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);
  if (!verifySignature(req, rawBody)) { res.status(401).json({ error: 'Invalid signature.' }); return; }

  const parsed = indexCheckSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues }); return; }

  const { data: env } = parsed;
  const {
    status, duration_ms, checked_at, index_stats, top_fragmented,
    total_indexes, healthy_count, reorganized_count, rebuilt_count,
    skipped_count, avg_fragmentation_pct, missing_indexes, error_message,
  } = env.data;

  const { data: logRow, error: insertErr } = await adminClient
    .from('db_index_logs')
    .insert({
      checked_at, status, duration_ms,
      environment:          env.environment,
      index_stats,
      top_fragmented,
      total_indexes,
      healthy_count,
      reorganized_count,
      rebuilt_count,
      skipped_count,
      avg_fragmentation_pct,
      missing_indexes,
      details:              env.data,
      error_message,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[webhook:dbIndex] insert failed', insertErr);
    res.status(500).json({ error: 'Failed to persist index log.' });
    return;
  }

  // Auto-create security finding for critical fragmentation
  if (status === 'critical') {
    await adminClient.from('security_findings').insert({
      title:           `High Index Fragmentation Detected — ${new Date(checked_at).toLocaleDateString('en-ZA')}`,
      description:     `${rebuilt_count} indexes require rebuild (>30% fragmented). Avg fragmentation: ${avg_fragmentation_pct}%. This will degrade query performance significantly.`,
      severity:        'high',
      status:          'open',
      source:          'scan',
      affected_system: 'HEQCIS',
    }).then(({ error: e }) => { if (e) console.error('[webhook:dbIndex] finding failed', e); });
  }

  void triggerAiAnalysis(logRow?.id as string, env.environment, env.data);
  res.status(200).json({ received: true, log_id: logRow?.id, status });
}

async function triggerAiAnalysis(logId: string, environment: string, data: Record<string, unknown>): Promise<void> {
  const AI_URL = process.env['INTERNAL_API_URL'] ?? '';
  if (!AI_URL || !logId) return;
  try {
    await fetch(`${AI_URL}/api/db-monitoring/index/${logId}/analyse`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env['INTERNAL_API_KEY'] ?? '' },
      body:    JSON.stringify({ environment, ...data }),
    });
  } catch (e) { console.warn('[webhook:dbIndex] AI trigger failed', e); }
}
