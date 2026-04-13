// api/routes/backupRuns.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { createBackupRunSchema, updateBackupRunSchema } from '@heqcis/core';
import { validateBody } from '../middleware/validate.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const backupRunsRouter = Router();

backupRunsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, database_name, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let query = adminClient.from('backup_runs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status)        query = query.eq('status', status);
    if (database_name) query = query.eq('database_name', database_name);
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[backupRuns:list]', err);
    res.status(500).json({ error: 'Failed to fetch backup runs.' });
  }
});

backupRunsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Backup run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[backupRuns:get]', err);
    res.status(500).json({ error: 'Failed to fetch backup run.' });
  }
});

backupRunsRouter.post('/', requirePermission('create', 'backup_runs'), validateBody(createBackupRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[backupRuns:create]', err);
    res.status(500).json({ error: 'Failed to create backup run.' });
  }
});

backupRunsRouter.patch('/:id', requirePermission('update', 'backup_runs'), validateBody(updateBackupRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Backup run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[backupRuns:update]', err);
    res.status(500).json({ error: 'Failed to update backup run.' });
  }
});
