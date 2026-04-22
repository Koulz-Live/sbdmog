// server/routes/auditLogs.ts
// Read-only endpoint — admin only. No create/update/delete via API.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requireRole } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { analyseAuditLogs } from '@heqcis/ai';

export const auditLogsRouter = Router();

// ── GET /audit-logs ──────────────────────────────────────────────────────────
auditLogsRouter.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const {
      actor_id,
      resource_type,
      resource_id,
      action,
      date_from,
      date_to,
      limit  = '50',
      offset = '0',
    } = req.query as Record<string, string>;

    let q = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (actor_id)      q = q.eq('actor_id', actor_id);
    if (resource_type) q = q.eq('resource_type', resource_type);
    if (resource_id)   q = q.eq('resource_id', resource_id);
    if (action)        q = q.eq('action', action);
    if (date_from)     q = q.gte('created_at', date_from);
    if (date_to)       q = q.lte('created_at', date_to);

    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    res.json({ data, count, meta: { total: count, limit: Number(limit), offset: Number(offset) } });
  } catch (err) {
    console.error('[auditLogs:list]', err);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// ── GET /audit-logs/export  (CSV download) ───────────────────────────────────
auditLogsRouter.get('/export', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const {
      actor_id,
      resource_type,
      resource_id,
      action,
      date_from,
      date_to,
    } = req.query as Record<string, string>;

    let q = adminClient
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10000); // safety cap

    if (actor_id)      q = q.eq('actor_id', actor_id);
    if (resource_type) q = q.eq('resource_type', resource_type);
    if (resource_id)   q = q.eq('resource_id', resource_id);
    if (action)        q = q.eq('action', action);
    if (date_from)     q = q.gte('created_at', date_from);
    if (date_to)       q = q.lte('created_at', date_to);

    const { data, error } = await q;
    if (error) throw error;

    const headers = ['id','actor_id','action','resource_type','resource_id','ip_address','user_agent','created_at'];
    const csvRows = [
      headers.join(','),
      ...(data ?? []).map((row: any) =>
        headers.map((h) => {
          const val = row[h] ?? '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(csvRows.join('\r\n'));
  } catch (err) {
    console.error('[auditLogs:export]', err);
    res.status(500).json({ error: 'Export failed.' });
  }
});

// ── POST /audit-logs/ai-analyse ───────────────────────────────────────────────
// Admin-only. Analyses recent audit log entries and returns a governance narrative.
// Does NOT insert any audit log entries — read-only integrity preserved.
auditLogsRouter.post('/ai-analyse', requireRole('admin'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const days = Number(req.body?.days ?? 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: entries, count, error } = await adminClient
      .from('audit_logs')
      .select('action, resource_type, created_at, metadata', { count: 'exact' })
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const result = await analyseAuditLogs({
      entries: (entries ?? []).map((e: any) => ({
        action:        e.action,
        resource_type: e.resource_type,
        created_at:    e.created_at,
        metadata:      e.metadata,
      })),
      totalCount:        count ?? 0,
      periodDescription: `last ${days} day${days !== 1 ? 's' : ''}`,
    });

    await adminClient.from('ai_generations').insert({
      resource_type:     'audit_logs',
      prompt_type:       'audit_logs_analyse',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    res.json({ data: { analysis: result.output, model: result.model, entries_analysed: entries?.length ?? 0 } });
  } catch (err) {
    console.error('[auditLogs:ai-analyse]', err);
    res.status(500).json({ error: 'AI analysis failed.' });
  }
});
