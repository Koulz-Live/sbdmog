// server/routes/governanceInsights.ts
// POST /api/governance-insights
// Aggregates live Supabase data across all governance tables,
// calls OpenAI, persists to ai_generations, and returns the result.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { generateGovernanceInsights } from '@heqcis/ai';
import type { GovernanceData } from '@heqcis/ai';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const governanceInsightsRouter = Router();

governanceInsightsRouter.post('/', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;

  try {
    // ── Parallel data aggregation from Supabase ───────────────────────────
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      incidentsOpen,
      incidentsP1P2,
      incidentsResolved30d,
      securityOpen,
      securityCritical,
      popiaEvents30d,
      submissionLatest,
      changesPending,
      changesImplemented30d,
      changesRejected30d,
      backups7d,
    ] = await Promise.all([
      adminClient
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']),

      adminClient
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress'])
        .in('severity', ['P1', 'P2']),

      adminClient
        .from('incidents')
        .select('id, resolved_at, created_at', { count: 'exact' })
        .eq('status', 'resolved')
        .gte('resolved_at', thirtyDaysAgo),

      adminClient
        .from('security_findings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),

      adminClient
        .from('security_findings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .in('severity', ['critical', 'high']),

      adminClient
        .from('popia_events')
        .select('id, event_type', { count: 'exact' })
        .gte('created_at', thirtyDaysAgo),

      adminClient
        .from('submission_readiness_checks')
        .select('readiness_score, status, blockers')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      adminClient
        .from('change_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'under_review']),

      adminClient
        .from('change_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'implemented')
        .gte('updated_at', thirtyDaysAgo),

      adminClient
        .from('change_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'rejected')
        .gte('updated_at', thirtyDaysAgo),

      adminClient
        .from('backup_runs')
        .select('id, status, completed_at')
        .gte('completed_at', sevenDaysAgo)
        .order('completed_at', { ascending: false }),
    ]);

    // ── Derive avg resolution hours ───────────────────────────────────────
    let avgResolutionHours: number | undefined;
    if (incidentsResolved30d.data && incidentsResolved30d.data.length > 0) {
      const totalMs = incidentsResolved30d.data.reduce((sum, inc) => {
        const created  = new Date(inc.created_at as string).getTime();
        const resolved = new Date(inc.resolved_at as string).getTime();
        return sum + (resolved - created);
      }, 0);
      avgResolutionHours = Math.round(totalMs / incidentsResolved30d.data.length / 3_600_000);
    }

    // ── Derive backup stats ───────────────────────────────────────────────
    const backupRows = backups7d.data ?? [];
    const backupTotal = backupRows.length;
    const backupFailed = backupRows.filter(b => b.status === 'failed').length;
    const backupSuccessRate = backupTotal > 0
      ? Math.round(((backupTotal - backupFailed) / backupTotal) * 100)
      : 100;
    const lastFailedBackup = backupRows.find(b => b.status === 'failed');

    // ── Derive POPIA breach count ─────────────────────────────────────────
    const popiaBreaches = (popiaEvents30d.data ?? []).filter(
      (e) => (e.event_type as string).toLowerCase().includes('breach'),
    ).length;

    // ── Build GovernanceData ──────────────────────────────────────────────
    const sub = submissionLatest.data;
    const govData: GovernanceData = {
      period: new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }),
      incidents: {
        open:               incidentsOpen.count        ?? 0,
        p1p2:               incidentsP1P2.count        ?? 0,
        resolvedLast30d:    incidentsResolved30d.count ?? 0,
        avgResolutionHours: avgResolutionHours ?? null,
      },
      security: {
        openFindings:       securityOpen.count     ?? 0,
        criticalFindings:   securityCritical.count ?? 0,
        overdueRemediation: 0, // not tracked yet; safe default
      },
      popia: {
        openEvents:       popiaEvents30d.count ?? 0,
        highSeverityEvents: popiaBreaches,
        unresolvedDays:   null,
      },
      submissionReadiness: {
        latestScore:  sub ? (sub.readiness_score as number) : null,
        latestStatus: sub ? (sub.status as string) : null,
        blockers:     sub ? ((sub.blockers as string[] | null) ?? []) : [],
      },
      changeRequests: {
        pendingApproval:   changesPending.count        ?? 0,
        implementedLast30d: changesImplemented30d.count ?? 0,
        rejectedLast30d:   changesRejected30d.count    ?? 0,
      },
      backups: {
        successRate7d: backupSuccessRate,
        lastFailureAt: lastFailedBackup?.completed_at as string ?? null,
      },
    };

    // ── Call OpenAI ───────────────────────────────────────────────────────
    const result = await generateGovernanceInsights(govData);

    // ── Persist to ai_generations ─────────────────────────────────────────
    await adminClient.from('ai_generations').insert({
      resource_type:     'governance',
      resource_id:       null,
      prompt_type:       'governance_insights',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    res.json({
      data: {
        output:     result.output,
        model:      result.model,
        tokens:     { prompt: result.prompt_tokens, completion: result.completion_tokens },
        generated_at: new Date().toISOString(),
        snapshot:   govData,
      },
    });
  } catch (err) {
    console.error('[governance-insights:generate]', err);
    res.status(500).json({ error: 'Governance insights generation failed.' });
  }
});
