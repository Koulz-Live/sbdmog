// api/routes/popiaEvents.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { generatePopiaEvents } from '@heqcis/ai';

export const popiaEventsRouter = Router();

const createSchema = z.object({
  event_type: z.enum(['breach','request','consent','deletion','audit']),
  description: z.string().min(10).max(10_000),
  data_subject: z.string().max(200).optional().nullable(),
  status: z.enum(['open','under_review','resolved','closed']).default('open'),
});

const updateSchema = createSchema.partial().extend({
  resolution_notes: z.string().max(5000).optional().nullable(),
  resolved_at: z.string().datetime().optional().nullable(),
});

popiaEventsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, event_type, limit = '25', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('popia_events').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status)     q = q.eq('status', status);
    if (event_type) q = q.eq('event_type', event_type);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch POPIA events.' });
  }
});

popiaEventsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('popia_events').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'POPIA event not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch POPIA event.' });
  }
});

popiaEventsRouter.post('/', requirePermission('create', 'popia_events'), validateBody(createSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('popia_events').insert({ ...req.body, reported_by: authed.user.id }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create POPIA event.' });
  }
});

popiaEventsRouter.patch('/:id', requirePermission('update', 'popia_events'), validateBody(updateSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('popia_events').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'POPIA event not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update POPIA event.' });
  }
});

// ── POST /popia-events/ai-generate ───────────────────────────────────────────
popiaEventsRouter.post('/ai-generate', requirePermission('create', 'popia_events'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const [etlRes, findingsRes] = await Promise.all([
      adminClient.from('etl_runs').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      adminClient.from('security_findings').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    const now = new Date();
    const period = now.toLocaleString('en-ZA', { month: 'long', year: 'numeric' });

    const result = await generatePopiaEvents({
      recentEtlUploads:    etlRes.count ?? 0,
      openSecurityFindings: findingsRes.count ?? 0,
      period,
    });

    const rows = result.events.map(e => ({ ...e, reported_by: authed.user.id }));
    const { data: inserted, error: insertError } = await adminClient
      .from('popia_events')
      .insert(rows)
      .select();
    if (insertError) throw insertError;

    await adminClient.from('ai_generations').insert({
      resource_type:     'popia_events',
      prompt_type:       'popia_events_generate',
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
    console.error('[popiaEvents:ai-generate]', err);
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
