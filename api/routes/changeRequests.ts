// api/routes/changeRequests.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import {
  createChangeRequestSchema,
  updateChangeRequestSchema,
  approveChangeRequestSchema,
  generateChangeRequestReference,
} from '@heqcis/core';
import { generateChangeRiskAssessment } from '@heqcis/ai';
import { validateBody } from '../middleware/validate.js';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const changeRequestsRouter = Router();

changeRequestsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = '25', offset = '0' } = req.query as Record<string, string>;
    let query = adminClient.from('change_requests').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[changeRequests:list]', err);
    res.status(500).json({ error: 'Failed to fetch change requests.' });
  }
});

changeRequestsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('change_requests').select('*, change_request_approvals(*)').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Change request not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[changeRequests:get]', err);
    res.status(500).json({ error: 'Failed to fetch change request.' });
  }
});

changeRequestsRouter.post('/', requirePermission('create', 'change_requests'), validateBody(createChangeRequestSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { count } = await adminClient.from('change_requests').select('id', { count: 'exact', head: true });
    const reference = generateChangeRequestReference((count ?? 0) + 1);
    const { data, error } = await adminClient.from('change_requests').insert({ ...req.body, reference, requested_by: authed.user.id }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[changeRequests:create]', err);
    res.status(500).json({ error: 'Failed to create change request.' });
  }
});

changeRequestsRouter.patch('/:id', requirePermission('update', 'change_requests'), validateBody(updateChangeRequestSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('change_requests').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Change request not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[changeRequests:update]', err);
    res.status(500).json({ error: 'Failed to update change request.' });
  }
});

changeRequestsRouter.post('/:id/approve', requireRole('admin'), validateBody(approveChangeRequestSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('change_request_approvals').insert({
      change_request_id: req.params['id']!,
      approver_id: authed.user.id,
      decision: req.body.decision,
      comments: req.body.comments ?? null,
      decided_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    if (req.body.decision === 'approved') {
      await adminClient.from('change_requests').update({ status: 'approved' }).eq('id', req.params['id']!);
    } else if (req.body.decision === 'rejected') {
      await adminClient.from('change_requests').update({ status: 'rejected' }).eq('id', req.params['id']!);
    }
    res.status(201).json({ data });
  } catch (err) {
    console.error('[changeRequests:approve]', err);
    res.status(500).json({ error: 'Failed to record approval.' });
  }
});

changeRequestsRouter.post('/:id/ai/risk', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: cr, error } = await adminClient.from('change_requests').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error || !cr) { res.status(404).json({ error: 'Change request not found.' }); return; }
    const result = await generateChangeRiskAssessment(cr);
    await adminClient.from('ai_generations').insert({ resource_type: 'change_requests', resource_id: cr.id, prompt_type: 'change_risk_assessment', prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, model: result.model, output: result.output, created_by: authed.user.id });
    await adminClient.from('change_requests').update({ ai_risk_assessment: result.output }).eq('id', cr.id);
    res.json({ data: { output: result.output, model: result.model } });
  } catch (err) {
    console.error('[changeRequests:ai:risk]', err);
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
