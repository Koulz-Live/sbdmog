// api/routes/reportRequests.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const reportRequestsRouter = Router();

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(['low','normal','high','urgent']).default('normal'),
  due_date: z.string().date().optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['submitted','in_progress','delivered','closed']).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  delivery_url: z.string().url().optional().nullable(),
});

reportRequestsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority, limit = '25', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('report_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status)   q = q.eq('status', status);
    if (priority) q = q.eq('priority', priority);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report requests.' });
  }
});

reportRequestsRouter.post('/', requirePermission('create', 'report_requests'), validateBody(createSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('report_requests').insert({ ...req.body, requester_id: authed.user.id }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create report request.' });
  }
});

reportRequestsRouter.patch('/:id', requirePermission('update', 'report_requests'), validateBody(updateSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('report_requests').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Report request not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report request.' });
  }
});
