// api/routes/securityFindings.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import { generateSecurityFindings } from '@heqcis/ai';

export const securityFindingsRouter = Router();

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(10_000).optional().nullable(),
  severity: z.enum(['critical','high','medium','low','info']),
  status: z.enum(['open','in_remediation','remediated','accepted','false_positive']).default('open'),
  source: z.enum(['scan','audit','manual','siem']),
  affected_system: z.string().max(200).optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  due_date: z.string().date().optional().nullable(),
});

securityFindingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { severity, status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('security_findings').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (severity) q = q.eq('severity', severity);
    if (status)   q = q.eq('status', status);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch security findings.' });
  }
});

securityFindingsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('security_findings').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Finding not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch finding.' });
  }
});

securityFindingsRouter.post('/', requirePermission('create', 'security_findings'), validateBody(createSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('security_findings').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create finding.' });
  }
});

securityFindingsRouter.patch('/:id', requirePermission('update', 'security_findings'), validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('security_findings').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Finding not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update finding.' });
  }
});

// ── POST /security-findings/ai-generate ──────────────────────────────────────
securityFindingsRouter.post('/ai-generate', requirePermission('create', 'security_findings'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    // Gather operational context
    const [incidentsRes, etlRes, backupsRes, existingRes] = await Promise.all([
      adminClient.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating']),
      adminClient.from('etl_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      adminClient.from('backup_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      adminClient.from('security_findings').select('title').eq('status', 'open').limit(20),
    ]);

    const result = await generateSecurityFindings({
      recentIncidents: incidentsRes.count ?? 0,
      failedEtlJobs:   etlRes.count ?? 0,
      failedBackups:   backupsRes.count ?? 0,
      existingOpenFindings: (existingRes.data ?? []).map((f: any) => f.title as string),
    });

    // Insert generated findings
    const rows = result.findings.map(f => ({ ...f, created_by: authed.user.id }));
    const { data: inserted, error: insertError } = await adminClient
      .from('security_findings')
      .insert(rows)
      .select();
    if (insertError) throw insertError;

    // Log to ai_generations
    await adminClient.from('ai_generations').insert({
      resource_type:     'security_findings',
      prompt_type:       'security_findings_generate',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    res.status(201).json({
      data: inserted,
      ai: { model: result.model, prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens },
    });
  } catch (err) {
    console.error('[securityFindings:ai-generate]', err);
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
