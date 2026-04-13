// api/webhooks/backupResults.ts
// HMAC-verified webhook for backup-check payloads from the Azure Functions connector.
// Signature scheme: x-heqcis-signature = sha256=HMAC-SHA256("timestamp.rawBody")
// Upserts a backup_run row and creates a security_finding when status is not 'ok'.

import type { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { adminClient } from '@heqcis/supabase';
import { z } from 'zod';

const WEBHOOK_SECRET    = process.env['WEBHOOK_SECRET'] ?? '';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

// ── Zod schema for the Azure Functions connector envelope ─────────────────────
const backupCheckSchema = z.object({
  source:          z.string(),
  job_name:        z.string(),
  environment:     z.string(),
  timestamp:       z.string(),
  payload_version: z.string(),
  data: z.object({
    status:                      z.enum(['ok', 'warning', 'critical', 'unknown']),
    database_name:               z.string(),
    last_backup_at:              z.string().nullable(),
    last_failure_at:             z.string().nullable(),
    last_backup_type:            z.enum(['full', 'differential', 'log']).nullable(),
    last_backup_size_bytes:      z.number().nullable(),
    last_backup_duration_seconds:z.number().nullable(),
    noinit_risk_detected:        z.boolean(),
    disk_free_bytes:             z.number().nullable(),
    error_message:               z.string().nullable(),
    remediation_note:            z.string().nullable(),
    checked_at:                  z.string(),
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

export async function handleBackupResults(req: Request, res: Response): Promise<void> {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8')
    ?? JSON.stringify(req.body);

  if (!verifySignature(req, rawBody)) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  const parsed = backupCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload.', issues: parsed.error.issues });
    return;
  }

  const { data: envelope } = parsed;
  const d = envelope.data;

  // Persist the backup run
  try {
    const { error } = await adminClient.from('backup_runs').insert({
      database_name:    d.database_name,
      status:           d.status,
      started_at:       d.last_backup_at,
      finished_at:      null,
      backup_type:      d.last_backup_type ?? 'full',
      size_bytes:       d.last_backup_size_bytes,
      duration_seconds: d.last_backup_duration_seconds,
      storage_path:     null,
      error_message:    d.error_message,
      triggered_by:     envelope.source,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[webhook:backupResults:insert]', err);
    res.status(500).json({ error: 'Failed to persist backup run.' });
    return;
  }

  // Create a security finding when backup is not healthy
  if (d.status !== 'ok') {
    const severity = d.status === 'critical' ? 'critical' : 'high';
    const description = [
      d.error_message,
      d.remediation_note,
      d.noinit_risk_detected ? 'NOINIT risk detected on backup chain.' : null,
    ].filter(Boolean).join(' ') || `Backup status: ${d.status}`;

    try {
      await adminClient.from('security_findings').insert({
        title:           `Backup ${d.status.toUpperCase()}: ${d.database_name}`,
        description,
        severity,
        status:          'open',
        source:          'scan',
        affected_system: envelope.source,
      });
    } catch (err) {
      console.error('[webhook:backupResults:finding]', err);
      // Non-fatal — the run was already stored
    }
  }

  res.status(201).json({ received: true, status: d.status, checked_at: d.checked_at });
}

