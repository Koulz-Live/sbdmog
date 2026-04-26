// server/webhooks/dbPerformanceResults.ts
// HMAC-verified webhook for database performance check payloads from Azure Functions.
// Persists each run to db_performance_logs, triggers an AI analysis, and
// auto-creates a security_finding / incident if status is critical.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminClient } from '@heqcis/supabase';
import { z } from 'zod';

const WEBHOOK_SECRET    = process.env['WEBHOOK_SECRET'] ?? '';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ── Schema ────────────────────────────────────────────────────────────────────
const resourceSchema = z.object({
  active_connections:     z.number(),
  long_running_count:     z.number(),
  page_life_expectancy_s: z.number(),
  runnable_tasks:         z.number(),
}).nullable();

const diskIoSchema = z.object({
  avg_read_stall_ms:  z.number(),
  avg_write_stall_ms: z.number(),
}).nullable();

const perfCheckSchema = z.object({
  source:          z.string(),
  job_name:        z.string(),
  environment:     z.string(),
  timestamp:       z.string(),
  payload_version: z.string(),
  data: z.object({
    status:        z.enum(['healthy', 'degraded', 'critical', 'unreachable', 'unknown']),
    duration_ms:   z.number(),
    checked_at:    z.string(),
    wait_stats:    z.array(z.record(z.unknown())).optional().default([]),
    slow_queries:  z.array(z.record(z.unknown())).optional().default([]),
    blocking:      z.array(z.record(z.unknown())).optional().default([]),
    resource:      resourceSchema.optional().default(null),
    disk_io:       diskIoSchema.optional().default(null),
    error_message: z.string().nullable(),
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
    .update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  try { return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function handleDbPerformanceResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const parsed = perfCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues });
    return;
  }

  const { data: env } = parsed;
  const { status, duration_ms, checked_at, wait_stats, slow_queries, blocking,
          resource, disk_io, error_message } = env.data;

  // ── Persist to db_performance_logs ────────────────────────────────────────
  const { data: logRow, error: insertErr } = await adminClient
    .from('db_performance_logs')
    .insert({
      checked_at:        checked_at,
      status,
      duration_ms,
      environment:       env.environment,
      wait_stats,
      slow_queries,
      blocking,
      active_connections: resource?.active_connections ?? null,
      long_running_count: resource?.long_running_count ?? null,
      disk_read_ms:       disk_io?.avg_read_stall_ms ?? null,
      disk_write_ms:      disk_io?.avg_write_stall_ms ?? null,
      details:            { wait_stats, slow_queries, blocking, resource, disk_io },
      error_message,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[webhook:dbPerf] insert failed', insertErr);
    res.status(500).json({ error: 'Failed to persist performance log.' });
    return;
  }

  // ── Auto-create incident for critical status ───────────────────────────────
  if (status === 'critical' || status === 'unreachable') {
    const blockingCount = (blocking ?? []).length;
    const longRunning   = resource?.long_running_count ?? 0;
    await adminClient.from('incidents').insert({
      title:           `Database Performance Critical — ${new Date(checked_at).toLocaleDateString('en-ZA')}`,
      description:     `Auto-detected: status=${status}, blocking chains=${blockingCount}, long-running queries=${longRunning}. ${error_message ?? ''}`.trim(),
      category:        'performance_degradation',
      affected_system: 'HEQCIS',
      severity:        status === 'unreachable' ? 'P1' : 'P2',
      status:          'open',
    }).then(({ error: e }) => { if (e) console.error('[webhook:dbPerf] incident create failed', e); });
  }

  // ── Trigger async AI analysis (fire-and-forget) ───────────────────────────
  void triggerAiAnalysis(logRow?.id as string, env.environment, {
    status, wait_stats, slow_queries, blocking, resource, disk_io, error_message,
  });

  res.status(200).json({ received: true, log_id: logRow?.id, status });
}

// ── AI Analysis (called after webhook ack) ────────────────────────────────────
async function triggerAiAnalysis(
  logId: string,
  environment: string,
  data: Record<string, unknown>,
): Promise<void> {
  const AI_URL = process.env['INTERNAL_API_URL'] ?? '';
  if (!AI_URL || !logId) return;
  try {
    await fetch(`${AI_URL}/api/db-monitoring/performance/${logId}/analyse`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-internal-key': process.env['INTERNAL_API_KEY'] ?? '',
      },
      body: JSON.stringify({ environment, ...data }),
    });
  } catch (e) {
    console.warn('[webhook:dbPerf] AI trigger failed', e);
  }
}
