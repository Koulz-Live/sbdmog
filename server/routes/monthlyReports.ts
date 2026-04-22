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

// ── POST /monthly-reports/ai-generate ────────────────────────────────────────
// Aggregates live data across all modules, drafts all 7 sections, creates new report row.
monthlyReportsRouter.post('/ai-generate', requirePermission('create', 'monthly_reports'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    // Determine period (default = current month YYYY-MM)
    const period: string = (req.body?.period as string) ?? new Date().toISOString().slice(0, 7);
    const [year, month] = period.split('-').map(Number) as [number, number];
    const periodStart = new Date(year, month - 1, 1).toISOString();
    const periodEnd   = new Date(year, month, 1).toISOString();

    // Aggregate live data for context
    const [incRes, backupRes, etlRes, secRes, popiaRes, submRes, crRes] = await Promise.all([
      adminClient.from('incidents').select('severity, status', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('backup_runs').select('status', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('etl_runs').select('status, dataset_type', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('security_findings').select('severity, status', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('popia_events').select('event_type, status', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('submission_readiness').select('status').gte('created_at', periodStart).lt('created_at', periodEnd),
      adminClient.from('change_requests').select('status, risk_level', { count: 'exact' }).gte('created_at', periodStart).lt('created_at', periodEnd),
    ]);

    const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' });

    // Build context strings for each section
    const incData    = incRes.data ?? [];
    const backData   = backupRes.data ?? [];
    const etlData    = etlRes.data ?? [];
    const secData    = secRes.data ?? [];
    const popiaData  = popiaRes.data ?? [];
    const crData     = crRes.data ?? [];

    const countBy = <T extends Record<string, unknown>>(arr: T[], key: keyof T) =>
      arr.reduce<Record<string, number>>((acc, item) => {
        const v = String(item[key] ?? 'unknown');
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});

    const fmt = (obj: Record<string, number>) =>
      Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';

    const sectionIncidents        = `Incidents in ${monthLabel}: total=${incData.length}. By severity: ${fmt(countBy(incData, 'severity'))}. By status: ${fmt(countBy(incData, 'status'))}.`;
    const sectionBackupEtl        = `Backup runs: total=${backData.length}, ${fmt(countBy(backData, 'status'))}. ETL runs: total=${etlData.length}, ${fmt(countBy(etlData, 'status'))}.`;
    const sectionChangeRequests   = `Change requests: total=${crData.length}. By status: ${fmt(countBy(crData, 'status'))}. By risk: ${fmt(countBy(crData, 'risk_level'))}.`;
    const sectionSecurityPopia    = `Security findings: total=${secData.length}, ${fmt(countBy(secData, 'severity'))}. POPIA events: total=${popiaData.length}, ${fmt(countBy(popiaData, 'event_type'))}.`;
    const sectionSubmReadiness    = `Submission readiness assessments: total=${(submRes.data ?? []).length}, ${fmt(countBy(submRes.data ?? [], 'status'))}.`;
    const sectionUpcomingWork     = `Planned follow-ups based on open items from ${monthLabel}.`;

    const result = await generateMonthlyReportDraft(period, {
      incidents:           sectionIncidents,
      backupEtl:           sectionBackupEtl,
      changeRequests:      sectionChangeRequests,
      securityPopia:       sectionSecurityPopia,
      submissionReadiness: sectionSubmReadiness,
      upcomingWork:        sectionUpcomingWork,
    });

    // Parse the AI output (expects JSON with section keys)
    let sections: Record<string, string> = {};
    try {
      sections = JSON.parse(result.output);
    } catch {
      // Fallback: put everything in executive_summary
      sections = { section_executive_summary: result.output };
    }

    const { data: newReport, error: insertError } = await adminClient
      .from('monthly_reports')
      .insert({
        period,
        prepared_by:                  authed.user.id,
        status:                       'draft',
        section_executive_summary:    sections['section_executive_summary'] ?? sections['executive_summary'] ?? null,
        section_incidents:            sections['section_incidents']            ?? sectionIncidents,
        section_backup_etl:           sections['section_backup_etl']           ?? sectionBackupEtl,
        section_change_requests:      sections['section_change_requests']      ?? sectionChangeRequests,
        section_security_popia:       sections['section_security_popia']       ?? sectionSecurityPopia,
        section_submission_readiness: sections['section_submission_readiness'] ?? sectionSubmReadiness,
        section_upcoming_work:        sections['section_upcoming_work']        ?? sectionUpcomingWork,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await adminClient.from('ai_generations').insert({
      resource_type:     'monthly_reports',
      resource_id:       newReport.id,
      prompt_type:       'monthly_report_generate',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    res.status(201).json({
      data: newReport,
      ai: { model: result.model, prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens },
    });
  } catch (err) {
    console.error('[monthlyReports:ai-generate]', err);
    res.status(500).json({ error: 'AI report generation failed.' });
  }
});
