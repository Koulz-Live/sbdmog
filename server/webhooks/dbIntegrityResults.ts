// server/webhooks/dbIntegrityResults.ts
// HMAC-verified webhooks for:
//   POST /webhooks/db-integrity-results       — structural integrity
//   POST /webhooks/db-data-integrity-results  — data quality / data integrity

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

// ── Schema: structural integrity ──────────────────────────────────────────────
const structIntegritySchema = z.object({
  source: z.string(), job_name: z.string(), environment: z.string(),
  timestamp: z.string(), payload_version: z.string(),
  data: z.object({
    status:               z.enum(['passed', 'warnings', 'errors', 'unreachable', 'unknown']),
    duration_ms:          z.number(),
    checked_at:           z.string(),
    object_checks:        z.array(z.record(z.unknown())).optional().default([]),
    allocation_errors:    z.number().optional().default(0),
    consistency_errors:   z.number().optional().default(0),
    log_space_used_pct:   z.number().nullable().optional(),
    log_reuse_wait:       z.string().optional(),
    disabled_constraints: z.array(z.record(z.unknown())).optional().default([]),
    error_message:        z.string().nullable(),
  }),
});

// ── Schema: data integrity ────────────────────────────────────────────────────
const dataIntegritySchema = z.object({
  source: z.string(), job_name: z.string(), environment: z.string(),
  timestamp: z.string(), payload_version: z.string(),
  data: z.object({
    status:           z.enum(['passed', 'warnings', 'errors', 'unreachable', 'unknown']),
    duration_ms:      z.number(),
    checked_at:       z.string(),
    null_checks:      z.array(z.record(z.unknown())).optional().default([]),
    ref_violations:   z.array(z.record(z.unknown())).optional().default([]),
    duplicate_checks: z.array(z.record(z.unknown())).optional().default([]),
    range_checks:     z.array(z.record(z.unknown())).optional().default([]),
    table_row_counts: z.array(z.record(z.unknown())).optional().default([]),
    total_issues:     z.number().optional().default(0),
    error_message:    z.string().nullable(),
  }),
});

// ── Handler: structural integrity ─────────────────────────────────────────────
export async function handleDbIntegrityResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);
  if (!verifySignature(req, rawBody)) { res.status(401).json({ error: 'Invalid signature.' }); return; }

  const parsed = structIntegritySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues }); return; }

  const { data: env } = parsed;
  const { status, duration_ms, checked_at, object_checks, allocation_errors,
          consistency_errors, log_space_used_pct, log_reuse_wait,
          disabled_constraints, error_message } = env.data;

  const { data: logRow, error: insertErr } = await adminClient
    .from('db_integrity_logs')
    .insert({
      checked_at, status, duration_ms,
      environment:          env.environment,
      object_checks,
      allocation_errors,
      consistency_errors,
      log_space_used_pct:   log_space_used_pct ?? null,
      log_reuse_wait:       log_reuse_wait ?? null,
      disabled_constraints,
      details:              env.data,
      error_message,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[webhook:dbIntegrity] insert failed', insertErr);
    res.status(500).json({ error: 'Failed to persist integrity log.' });
    return;
  }

  // Auto-create incident for errors
  if (status === 'errors') {
    await adminClient.from('incidents').insert({
      title:           `Database Integrity Errors — ${new Date(checked_at).toLocaleDateString('en-ZA')}`,
      description:     `Auto-detected: consistency_errors=${consistency_errors}, allocation_errors=${allocation_errors}, disabled_constraints=${disabled_constraints.length}`,
      category:        'data_quality',
      affected_system: 'HEQCIS',
      severity:        'P2',
      status:          'open',
    }).then(({ error: e }) => { if (e) console.error('[webhook:dbIntegrity] incident failed', e); });
  }

  void triggerAiAnalysis('integrity', logRow?.id as string, env.environment, env.data);
  res.status(200).json({ received: true, log_id: logRow?.id, status });
}

// ── Handler: data integrity ───────────────────────────────────────────────────
export async function handleDbDataIntegrityResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);
  if (!verifySignature(req, rawBody)) { res.status(401).json({ error: 'Invalid signature.' }); return; }

  const parsed = dataIntegritySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues }); return; }

  const { data: env } = parsed;
  const { status, duration_ms, checked_at, null_checks, ref_violations,
          duplicate_checks, range_checks, table_row_counts,
          total_issues, error_message } = env.data;

  const { data: logRow, error: insertErr } = await adminClient
    .from('db_data_integrity_logs')
    .insert({
      checked_at, status, duration_ms,
      environment:     env.environment,
      null_checks,
      ref_violations,
      duplicate_checks,
      range_checks,
      table_row_counts,
      total_issues,
      details:         env.data,
      error_message,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[webhook:dbDataIntegrity] insert failed', insertErr);
    res.status(500).json({ error: 'Failed to persist data integrity log.' });
    return;
  }

  if (status === 'errors') {
    await adminClient.from('incidents').insert({
      title:           `Data Integrity Issues Detected — ${new Date(checked_at).toLocaleDateString('en-ZA')}`,
      description:     `Auto-detected: total_issues=${total_issues}. Null violations, duplicates, and range anomalies found.`,
      category:        'data_quality',
      affected_system: 'HEQCIS',
      severity:        'P2',
      status:          'open',
    }).then(({ error: e }) => { if (e) console.error('[webhook:dbDataIntegrity] incident failed', e); });
  }

  void triggerAiAnalysis('data-integrity', logRow?.id as string, env.environment, env.data);
  res.status(200).json({ received: true, log_id: logRow?.id, status });
}

// ── AI trigger helper ─────────────────────────────────────────────────────────
async function triggerAiAnalysis(
  type: string, logId: string, environment: string, data: Record<string, unknown>,
): Promise<void> {
  const AI_URL = process.env['INTERNAL_API_URL'] ?? '';
  if (!AI_URL || !logId) return;
  try {
    await fetch(`${AI_URL}/api/db-monitoring/${type}/${logId}/analyse`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env['INTERNAL_API_KEY'] ?? '' },
      body:    JSON.stringify({ environment, ...data }),
    });
  } catch (e) { console.warn(`[webhook:db${type}] AI trigger failed`, e); }
}
