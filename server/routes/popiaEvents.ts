// api/routes/popiaEvents.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';

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
