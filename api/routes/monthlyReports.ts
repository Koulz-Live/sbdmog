// api/routes/monthlyReports.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission, requireRole } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { generateMonthlyReportDraft } from '@heqcis/ai';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const monthlyReportsRouter = Router();

const createSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM'),
  section_executive_summary:    z.string().optional().nullable(),
  section_incidents:            z.string().optional().nullable(),
  section_backup_etl:           z.string().optional().nullable(),
  section_change_requests:      z.string().optional().nullable(),
  section_security_popia:       z.string().optional().nullable(),
  section_submission_readiness: z.string().optional().nullable(),
  section_upcoming_work:        z.string().optional().nullable(),
});

monthlyReportsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit = '12', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('monthly_reports').select('*', { count: 'exact' }).order('period', { ascending: false });
    if (status) q = q.eq('status', status);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch monthly reports.' });
  }
});

monthlyReportsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('monthly_reports').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Report not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch report.' });
  }
});

monthlyReportsRouter.post('/', requirePermission('create', 'monthly_reports'), validateBody(createSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('monthly_reports').insert({ ...req.body, prepared_by: authed.user.id }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create monthly report.' });
  }
});

monthlyReportsRouter.patch('/:id', requirePermission('update', 'monthly_reports'), validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('monthly_reports').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Report not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update monthly report.' });
  }
});

monthlyReportsRouter.post('/:id/approve', requireRole('admin'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('monthly_reports').update({ status: 'approved', approved_by: authed.user.id, approved_at: new Date().toISOString() }).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve report.' });
  }
});

monthlyReportsRouter.post('/:id/publish', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('monthly_reports').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish report.' });
  }
});

monthlyReportsRouter.post('/:id/ai/draft', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: report, error } = await adminClient.from('monthly_reports').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error || !report) { res.status(404).json({ error: 'Report not found.' }); return; }
    const result = await generateMonthlyReportDraft(report.period, {
      incidents:           report.section_incidents ?? '',
      backupEtl:           report.section_backup_etl ?? '',
      changeRequests:      report.section_change_requests ?? '',
      securityPopia:       report.section_security_popia ?? '',
      submissionReadiness: report.section_submission_readiness ?? '',
      upcomingWork:        report.section_upcoming_work ?? '',
    });
    await adminClient.from('ai_generations').insert({ resource_type: 'monthly_reports', resource_id: report.id, prompt_type: 'monthly_report_draft', prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, model: result.model, output: result.output, created_by: authed.user.id });
    res.json({ data: { output: result.output, model: result.model } });
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
