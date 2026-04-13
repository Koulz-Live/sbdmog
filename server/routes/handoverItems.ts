// api/routes/handoverItems.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';

export const handoverItemsRouter = Router();

const createSchema = z.object({
  category: z.enum(['knowledge','access','documentation','process','system']),
  title: z.string().min(3).max(200),
  description: z.string().max(10_000).optional().nullable(),
  status: z.enum(['pending','in_progress','completed']).default('pending'),
  owner_id: z.string().uuid().optional().nullable(),
  target_date: z.string().date().optional().nullable(),
  evidence_url: z.string().url().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

handoverItemsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { category, status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('handover_items').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    if (status)   q = q.eq('status', status);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch handover items.' });
  }
});

handoverItemsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('handover_items').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Handover item not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch handover item.' });
  }
});

handoverItemsRouter.post('/', requirePermission('create', 'handover_items'), validateBody(createSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('handover_items').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create handover item.' });
  }
});

handoverItemsRouter.patch('/:id', requirePermission('update', 'handover_items'), validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  try {
    const patches: Record<string, unknown> = { ...req.body };
    if (req.body.status === 'completed' && !req.body.completed_at) {
      patches['completed_at'] = new Date().toISOString();
    }
    const { data, error } = await adminClient.from('handover_items').update(patches).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Handover item not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update handover item.' });
  }
});
