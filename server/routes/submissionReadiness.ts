// api/routes/submissionReadiness.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const submissionReadinessRouter = Router();

const createCheckSchema = z.object({
  submission_type: z.enum(['SAQA_NLRD','DHET_STATS','HEQF_MAPPING','OTHER']),
  period: z.string().min(4).max(20),
  overall_status: z.enum(['pending','in_progress','ready','blocked']).default('pending'),
  notes: z.string().max(5000).optional().nullable(),
});

const addIssueSchema = z.object({
  field_name: z.string().max(200).optional().nullable(),
  issue_type: z.enum(['missing_field','format_error','out_of_range','duplicate','other']),
  description: z.string().min(5).max(2000),
});

submissionReadinessRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { submission_type, limit = '25', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('submission_readiness_checks').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (submission_type) q = q.eq('submission_type', submission_type);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch submission checks.' });
  }
});

submissionReadinessRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('submission_readiness_checks')
      .select('*, submission_validation_issues(*)')
      .eq('id', req.params['id']!)
      .maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Check not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch check.' });
  }
});

submissionReadinessRouter.post('/', requirePermission('create', 'submission_readiness'), validateBody(createCheckSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('submission_readiness_checks').insert({ ...req.body, checked_by: authed.user.id, checked_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create submission check.' });
  }
});

submissionReadinessRouter.post('/:id/issues', requirePermission('create', 'submission_readiness'), validateBody(addIssueSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('submission_validation_issues').insert({ ...req.body, check_id: req.params['id']! }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add validation issue.' });
  }
});
