// server/routes/dbMonitoring.ts
// GET  /api/db-monitoring/performance        — list performance logs
// GET  /api/db-monitoring/performance/:id    — single log detail
// POST /api/db-monitoring/performance/:id/analyse — trigger AI analysis
// GET  /api/db-monitoring/integrity          — list structural integrity logs
// GET  /api/db-monitoring/integrity/:id
// POST /api/db-monitoring/integrity/:id/analyse
// GET  /api/db-monitoring/data-integrity     — list data integrity logs
// GET  /api/db-monitoring/data-integrity/:id
// POST /api/db-monitoring/data-integrity/:id/analyse
// GET  /api/db-monitoring/index              — list index maintenance logs
// GET  /api/db-monitoring/index/:id
// POST /api/db-monitoring/index/:id/analyse
// GET  /api/db-monitoring/summary            — aggregated dashboard summary

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import {
  analyseDbPerformance,
  analyseDbIntegrity,
  analyseDbDataIntegrity,
  analyseDbIndexMaintenance,
} from '@heqcis/ai';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const dbMonitoringRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePagination(req: Request) {
  const page  = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '25'), 10)));
  return { from: (page - 1) * limit, to: page * limit - 1, limit };
}

// ══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

dbMonitoringRouter.get('/performance', async (req: Request, res: Response) => {
  try {
    const { from, to } = parsePagination(req);
    const { data, error, count } = await adminClient
      .from('db_performance_logs')
      .select('id,checked_at,status,duration_ms,environment,active_connections,long_running_count,disk_read_ms,disk_write_ms,ai_summary,ai_severity,error_message,cpu_pct,memory_pct', { count: 'exact' })
      .order('checked_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) { console.error('[dbMon:perf:list]', err); res.status(500).json({ error: 'Failed to fetch performance logs.' }); }
});

dbMonitoringRouter.get('/performance/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('db_performance_logs')
      .select('*')
      .eq('id', req.params['id'] as string)
      .single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data });
  } catch (err) { console.error('[dbMon:perf:detail]', err); res.status(500).json({ error: 'Failed to fetch log.' }); }
});

dbMonitoringRouter.post('/performance/:id/analyse', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: log, error } = await adminClient
      .from('db_performance_logs')
      .select('*')
      .eq('id', req.params['id'] as string)
      .single();
    if (error || !log) { res.status(404).json({ error: 'Log not found.' }); return; }

    const ai = await analyseDbPerformance({
      status:       String(log.status),
      wait_stats:   Array.isArray(log.wait_stats)  ? log.wait_stats  : [],
      slow_queries: Array.isArray(log.slow_queries) ? log.slow_queries : [],
      blocking:     Array.isArray(log.blocking)     ? log.blocking     : [],
      resource:     log.details,
      disk_io:      { avg_read_stall_ms: log.disk_read_ms, avg_write_stall_ms: log.disk_write_ms },
    });

    await adminClient.from('db_performance_logs').update({
      ai_summary:       ai.summary,
      ai_actions:       ai.actions,
      ai_severity:      ai.severity,
      ai_generated_at:  new Date().toISOString(),
    }).eq('id', req.params['id'] as string);

    await adminClient.from('ai_generations').insert({
      entity_type:       'db_performance_log',
      entity_id:         req.params['id'],
      generation_type:   'db_performance_analysis',
      prompt_tokens:     ai.prompt_tokens,
      completion_tokens: ai.completion_tokens,
      model:             ai.model,
      output_text:       ai.output,
      created_by:        authed.user?.id ?? null,
    });

    res.json({ summary: ai.summary, actions: ai.actions, severity: ai.severity });
  } catch (err) { console.error('[dbMon:perf:analyse]', err); res.status(500).json({ error: 'AI analysis failed.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL INTEGRITY
// ══════════════════════════════════════════════════════════════════════════════

dbMonitoringRouter.get('/integrity', async (req: Request, res: Response) => {
  try {
    const { from, to } = parsePagination(req);
    const { data, error, count } = await adminClient
      .from('db_integrity_logs')
      .select('id,checked_at,status,duration_ms,environment,allocation_errors,consistency_errors,log_space_used_pct,log_reuse_wait,ai_summary,ai_severity,error_message', { count: 'exact' })
      .order('checked_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) { console.error('[dbMon:integrity:list]', err); res.status(500).json({ error: 'Failed to fetch integrity logs.' }); }
});

dbMonitoringRouter.get('/integrity/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('db_integrity_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data });
  } catch (err) { console.error('[dbMon:integrity:detail]', err); res.status(500).json({ error: 'Failed to fetch log.' }); }
});

dbMonitoringRouter.post('/integrity/:id/analyse', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: log, error } = await adminClient
      .from('db_integrity_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error || !log) { res.status(404).json({ error: 'Log not found.' }); return; }

    const ai = await analyseDbIntegrity({
      status:               String(log.status),
      consistency_errors:   Number(log.consistency_errors ?? 0),
      allocation_errors:    Number(log.allocation_errors ?? 0),
      log_space_used_pct:   log.log_space_used_pct != null ? Number(log.log_space_used_pct) : null,
      log_reuse_wait:       log.log_reuse_wait as string | null,
      disabled_constraints: Array.isArray(log.disabled_constraints) ? log.disabled_constraints : [],
      object_checks:        Array.isArray(log.object_checks) ? log.object_checks : [],
    });

    await adminClient.from('db_integrity_logs').update({
      ai_summary: ai.summary, ai_actions: ai.actions, ai_severity: ai.severity, ai_generated_at: new Date().toISOString(),
    }).eq('id', req.params['id'] as string);

    await adminClient.from('ai_generations').insert({
      entity_type: 'db_integrity_log', entity_id: req.params['id'],
      generation_type: 'db_integrity_analysis',
      prompt_tokens: ai.prompt_tokens, completion_tokens: ai.completion_tokens,
      model: ai.model, output_text: ai.output, created_by: authed.user?.id ?? null,
    });

    res.json({ summary: ai.summary, actions: ai.actions, severity: ai.severity });
  } catch (err) { console.error('[dbMon:integrity:analyse]', err); res.status(500).json({ error: 'AI analysis failed.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY
// ══════════════════════════════════════════════════════════════════════════════

dbMonitoringRouter.get('/data-integrity', async (req: Request, res: Response) => {
  try {
    const { from, to } = parsePagination(req);
    const { data, error, count } = await adminClient
      .from('db_data_integrity_logs')
      .select('id,checked_at,status,duration_ms,environment,total_issues,ai_summary,ai_severity,error_message', { count: 'exact' })
      .order('checked_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) { console.error('[dbMon:dataIntegrity:list]', err); res.status(500).json({ error: 'Failed to fetch data integrity logs.' }); }
});

dbMonitoringRouter.get('/data-integrity/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('db_data_integrity_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data });
  } catch (err) { console.error('[dbMon:dataIntegrity:detail]', err); res.status(500).json({ error: 'Failed to fetch log.' }); }
});

dbMonitoringRouter.post('/data-integrity/:id/analyse', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: log, error } = await adminClient
      .from('db_data_integrity_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error || !log) { res.status(404).json({ error: 'Log not found.' }); return; }

    const ai = await analyseDbDataIntegrity({
      status:          String(log.status),
      total_issues:    Number(log.total_issues ?? 0),
      null_checks:     Array.isArray(log.null_checks) ? log.null_checks : [],
      duplicate_checks: Array.isArray(log.duplicate_checks) ? log.duplicate_checks : [],
      range_checks:    Array.isArray(log.range_checks) ? log.range_checks : [],
      table_row_counts: Array.isArray(log.table_row_counts) ? log.table_row_counts : [],
    });

    await adminClient.from('db_data_integrity_logs').update({
      ai_summary: ai.summary, ai_actions: ai.actions, ai_severity: ai.severity, ai_generated_at: new Date().toISOString(),
    }).eq('id', req.params['id'] as string);

    await adminClient.from('ai_generations').insert({
      entity_type: 'db_data_integrity_log', entity_id: req.params['id'],
      generation_type: 'db_data_integrity_analysis',
      prompt_tokens: ai.prompt_tokens, completion_tokens: ai.completion_tokens,
      model: ai.model, output_text: ai.output, created_by: authed.user?.id ?? null,
    });

    res.json({ summary: ai.summary, actions: ai.actions, severity: ai.severity });
  } catch (err) { console.error('[dbMon:dataIntegrity:analyse]', err); res.status(500).json({ error: 'AI analysis failed.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// INDEX MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════════

dbMonitoringRouter.get('/index', async (req: Request, res: Response) => {
  try {
    const { from, to } = parsePagination(req);
    const { data, error, count } = await adminClient
      .from('db_index_logs')
      .select('id,checked_at,status,duration_ms,environment,total_indexes,healthy_count,reorganized_count,rebuilt_count,skipped_count,avg_fragmentation_pct,ai_summary,ai_severity,error_message', { count: 'exact' })
      .order('checked_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    res.json({ data: data ?? [], count: count ?? 0 });
  } catch (err) { console.error('[dbMon:index:list]', err); res.status(500).json({ error: 'Failed to fetch index logs.' }); }
});

dbMonitoringRouter.get('/index/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('db_index_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Not found.' }); return; }
    res.json({ data });
  } catch (err) { console.error('[dbMon:index:detail]', err); res.status(500).json({ error: 'Failed to fetch log.' }); }
});

dbMonitoringRouter.post('/index/:id/analyse', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data: log, error } = await adminClient
      .from('db_index_logs').select('*').eq('id', req.params['id'] as string).single();
    if (error || !log) { res.status(404).json({ error: 'Log not found.' }); return; }

    const ai = await analyseDbIndexMaintenance({
      status:                String(log.status),
      total_indexes:         Number(log.total_indexes ?? 0),
      rebuilt_count:         Number(log.rebuilt_count ?? 0),
      reorganized_count:     Number(log.reorganized_count ?? 0),
      avg_fragmentation_pct: Number(log.avg_fragmentation_pct ?? 0),
      top_fragmented:        Array.isArray(log.top_fragmented) ? log.top_fragmented : [],
      missing_indexes:       Array.isArray(log.missing_indexes) ? log.missing_indexes : [],
    });

    await adminClient.from('db_index_logs').update({
      ai_summary: ai.summary, ai_actions: ai.actions, ai_severity: ai.severity, ai_generated_at: new Date().toISOString(),
    }).eq('id', req.params['id'] as string);

    await adminClient.from('ai_generations').insert({
      entity_type: 'db_index_log', entity_id: req.params['id'],
      generation_type: 'db_index_analysis',
      prompt_tokens: ai.prompt_tokens, completion_tokens: ai.completion_tokens,
      model: ai.model, output_text: ai.output, created_by: authed.user?.id ?? null,
    });

    res.json({ summary: ai.summary, actions: ai.actions, severity: ai.severity });
  } catch (err) { console.error('[dbMon:index:analyse]', err); res.status(500).json({ error: 'AI analysis failed.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

dbMonitoringRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [perf, integrity, dataInteg, indexLogs] = await Promise.all([
      adminClient.from('db_performance_logs')
        .select('id,checked_at,status,ai_severity,long_running_count,disk_read_ms,disk_write_ms')
        .order('checked_at', { ascending: false }).limit(7),
      adminClient.from('db_integrity_logs')
        .select('id,checked_at,status,ai_severity,consistency_errors,allocation_errors')
        .order('checked_at', { ascending: false }).limit(7),
      adminClient.from('db_data_integrity_logs')
        .select('id,checked_at,status,ai_severity,total_issues')
        .order('checked_at', { ascending: false }).limit(7),
      adminClient.from('db_index_logs')
        .select('id,checked_at,status,ai_severity,rebuilt_count,reorganized_count,avg_fragmentation_pct')
        .order('checked_at', { ascending: false }).limit(7),
    ]);

    const latestPerf      = perf.data?.[0]      ?? null;
    const latestIntegrity = integrity.data?.[0]  ?? null;
    const latestDataInteg = dataInteg.data?.[0]  ?? null;
    const latestIndex     = indexLogs.data?.[0]  ?? null;

    res.json({
      performance: {
        latest: latestPerf,
        history: perf.data ?? [],
        critical_count: (perf.data ?? []).filter(r => r.status === 'critical').length,
      },
      integrity: {
        latest: latestIntegrity,
        history: integrity.data ?? [],
        error_count: (integrity.data ?? []).filter(r => r.status === 'errors').length,
      },
      data_integrity: {
        latest: latestDataInteg,
        history: dataInteg.data ?? [],
        issue_count: (dataInteg.data ?? []).reduce((s, r) => s + Number(r.total_issues ?? 0), 0),
      },
      index: {
        latest: latestIndex,
        history: indexLogs.data ?? [],
        rebuild_total: (indexLogs.data ?? []).reduce((s, r) => s + Number(r.rebuilt_count ?? 0), 0),
      },
    });
  } catch (err) { console.error('[dbMon:summary]', err); res.status(500).json({ error: 'Failed to fetch summary.' }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL TRIGGER — invokes Azure Function via admin API
// POST /api/db-monitoring/trigger/:type
// ══════════════════════════════════════════════════════════════════════════════

const FUNC_MAP: Record<string, string> = {
  'performance':    'performanceCheck',
  'integrity':      'integrityCheck',
  'data-integrity': 'integrityCheck',
  'index':          'indexCheck',
};

const FUNC_APP_HOST = 'https://func-heqcis-connectors.azurewebsites.net';

dbMonitoringRouter.post('/trigger/:type', async (req: Request, res: Response) => {
  const { type } = req.params as { type: string };
  const funcName = FUNC_MAP[type];
  if (!funcName) {
    res.status(400).json({ error: `Unknown monitor type: "${type}". Valid values: ${Object.keys(FUNC_MAP).join(', ')}` });
    return;
  }

  const masterKey = process.env['AZURE_FUNC_MASTER_KEY'];
  if (!masterKey) {
    res.status(503).json({ error: 'AZURE_FUNC_MASTER_KEY not configured on server.' });
    return;
  }

  try {
    const url = `${FUNC_APP_HOST}/admin/functions/${funcName}/invoke`;
    const r = await fetch(url, {
      method:  'POST',
      headers: { 'x-functions-key': masterKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ input: null }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`[dbMon:trigger] Azure Function invoke failed ${r.status}:`, body);
      res.status(502).json({ error: `Function invoke failed with status ${r.status}.` });
      return;
    }

    console.log(`[dbMon:trigger] Invoked ${funcName} successfully for type="${type}"`);
    res.json({ ok: true, functionName: funcName, type });
  } catch (err) {
    console.error('[dbMon:trigger]', err);
    res.status(500).json({ error: 'Failed to invoke Azure Function.' });
  }
});
