// api/routes/etlRuns.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { createEtlRunSchema, updateEtlRunSchema } from '@heqcis/core';
import { validateBody } from '../middleware/validate.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const etlRunsRouter = Router();

etlRunsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, job_name, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let query = adminClient.from('etl_runs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status)   query = query.eq('status', status);
    if (job_name) query = query.eq('job_name', job_name);
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[etlRuns:list]', err);
    res.status(500).json({ error: 'Failed to fetch ETL runs.' });
  }
});

etlRunsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('etl_runs').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'ETL run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[etlRuns:get]', err);
    res.status(500).json({ error: 'Failed to fetch ETL run.' });
  }
});

etlRunsRouter.post('/', requirePermission('create', 'etl_runs'), validateBody(createEtlRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('etl_runs').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[etlRuns:create]', err);
    res.status(500).json({ error: 'Failed to create ETL run.' });
  }
});

etlRunsRouter.patch('/:id', requirePermission('update', 'etl_runs'), validateBody(updateEtlRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('etl_runs').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'ETL run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[etlRuns:update]', err);
    res.status(500).json({ error: 'Failed to update ETL run.' });
  }
});
