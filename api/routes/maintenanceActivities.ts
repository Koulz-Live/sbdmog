// api/routes/maintenanceActivities.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';

export const maintenanceActivitiesRouter = Router();

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional().nullable(),
  activity_type: z.enum(['scheduled','emergency','patch','upgrade','audit']),
  status: z.enum(['planned','in_progress','completed','cancelled']).default('planned'),
  system_target: z.string().max(200).optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  performed_by: z.string().uuid().optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
});

maintenanceActivitiesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('maintenance_activities').select('*', { count: 'exact' }).order('scheduled_at', { ascending: false });
    if (status) q = q.eq('status', status);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[maintenance:list]', err);
    res.status(500).json({ error: 'Failed to fetch maintenance activities.' });
  }
});

maintenanceActivitiesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('maintenance_activities').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Activity not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[maintenance:get]', err);
    res.status(500).json({ error: 'Failed to fetch activity.' });
  }
});

maintenanceActivitiesRouter.post('/', requirePermission('create', 'maintenance_activities'), validateBody(createSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('maintenance_activities').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[maintenance:create]', err);
    res.status(500).json({ error: 'Failed to create activity.' });
  }
});

maintenanceActivitiesRouter.patch('/:id', requirePermission('update', 'maintenance_activities'), validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('maintenance_activities').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Activity not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[maintenance:update]', err);
    res.status(500).json({ error: 'Failed to update activity.' });
  }
});
