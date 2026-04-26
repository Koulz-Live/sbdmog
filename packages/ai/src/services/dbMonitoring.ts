// packages/ai/src/services/dbMonitoring.ts
// AI service: analyse database monitoring snapshots and return structured insights.

import { openai, DEFAULT_MODEL } from '../client.js';
import type { AiResult } from './summarise.js';
import {
  DB_MONITORING_SYSTEM,
  buildPerfAnalysisPrompt,
  buildIntegrityAnalysisPrompt,
  buildDataIntegrityAnalysisPrompt,
  buildIndexAnalysisPrompt,
} from '../prompts/dbMonitoring.js';

export interface DbMonitoringAiResult extends AiResult {
  summary:  string;
  actions:  string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

async function callOpenAI(prompt: string): Promise<DbMonitoringAiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: DB_MONITORING_SYSTEM },
      { role: 'user',   content: prompt },
    ],
    max_tokens: 600,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  let parsed: { summary?: string; actions?: string[]; severity?: string } = {};
  try { parsed = JSON.parse(raw) as typeof parsed; } catch { /* ignore */ }

  return {
    output:            raw,
    prompt_tokens:     response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model:             response.model,
    summary:           parsed.summary ?? '',
    actions:           Array.isArray(parsed.actions) ? parsed.actions : [],
    severity:          (['low','medium','high','critical'].includes(parsed.severity ?? '') ? parsed.severity : 'low') as DbMonitoringAiResult['severity'],
  };
}

export async function analyseDbPerformance(data: {
  status: string;
  wait_stats: unknown[];
  slow_queries: unknown[];
  blocking: unknown[];
  resource: unknown;
  disk_io: unknown;
}): Promise<DbMonitoringAiResult> {
  return callOpenAI(buildPerfAnalysisPrompt(data));
}

export async function analyseDbIntegrity(data: {
  status: string;
  consistency_errors: number;
  allocation_errors: number;
  log_space_used_pct: number | null;
  log_reuse_wait: string | null;
  disabled_constraints: unknown[];
  object_checks: unknown[];
}): Promise<DbMonitoringAiResult> {
  return callOpenAI(buildIntegrityAnalysisPrompt(data));
}

export async function analyseDbDataIntegrity(data: {
  status: string;
  total_issues: number;
  null_checks: unknown[];
  duplicate_checks: unknown[];
  range_checks: unknown[];
  table_row_counts: unknown[];
}): Promise<DbMonitoringAiResult> {
  return callOpenAI(buildDataIntegrityAnalysisPrompt(data));
}

export async function analyseDbIndexMaintenance(data: {
  status: string;
  total_indexes: number;
  rebuilt_count: number;
  reorganized_count: number;
  avg_fragmentation_pct: number;
  top_fragmented: unknown[];
  missing_indexes: unknown[];
}): Promise<DbMonitoringAiResult> {
  return callOpenAI(buildIndexAnalysisPrompt(data));
}
