// packages/ai/src/prompts/dbMonitoring.ts
// System prompts and prompt builders for database monitoring AI analysis.

export const DB_MONITORING_SYSTEM = `You are an expert SQL Server DBA analyst for the HEQCIS system — a South African higher education qualification management platform running on SQL Server 2019.

Your role is to analyse automated database monitoring data and provide:
1. A concise, plain-English summary of findings (2-4 sentences)
2. A prioritised list of recommended actions (up to 5)
3. A severity classification: low | medium | high | critical

Always ground recommendations in the specific metrics provided. Be direct and operational — your audience is IT engineers and database administrators.
`;

// ── Performance ───────────────────────────────────────────────────────────────
export function buildPerfAnalysisPrompt(data: {
  status: string;
  wait_stats: unknown[];
  slow_queries: unknown[];
  blocking: unknown[];
  resource: unknown;
  disk_io: unknown;
}): string {
  return `Analyse the following SQL Server performance snapshot for the HEQCIS database:

OVERALL STATUS: ${data.status}

TOP WAIT STATISTICS:
${JSON.stringify(data.wait_stats?.slice(0, 5) ?? [], null, 2)}

TOP SLOW QUERIES:
${JSON.stringify(data.slow_queries?.slice(0, 3) ?? [], null, 2)}

BLOCKING CHAINS (active):
${JSON.stringify(data.blocking ?? [], null, 2)}

RESOURCE METRICS:
${JSON.stringify(data.resource ?? {}, null, 2)}

DISK I/O:
${JSON.stringify(data.disk_io ?? {}, null, 2)}

Provide:
1. summary: A 2-4 sentence plain-English analysis of the performance state
2. actions: Up to 5 concrete recommended actions as a JSON array of strings
3. severity: one of low | medium | high | critical

Respond ONLY with valid JSON: { "summary": "...", "actions": ["...", "..."], "severity": "..." }`;
}

// ── Structural Integrity ───────────────────────────────────────────────────────
export function buildIntegrityAnalysisPrompt(data: {
  status: string;
  consistency_errors: number;
  allocation_errors: number;
  log_space_used_pct: number | null;
  log_reuse_wait: string | null;
  disabled_constraints: unknown[];
  object_checks: unknown[];
}): string {
  return `Analyse the following SQL Server structural integrity check for the HEQCIS database:

OVERALL STATUS: ${data.status}
CONSISTENCY ERRORS: ${data.consistency_errors}
ALLOCATION ERRORS: ${data.allocation_errors}
LOG SPACE USED: ${data.log_space_used_pct ?? 'unknown'}%
LOG REUSE WAIT: ${data.log_reuse_wait ?? 'N/A'}
DISABLED CONSTRAINTS: ${data.disabled_constraints?.length ?? 0}

TOP OBJECTS BY SIZE:
${JSON.stringify(data.object_checks?.slice(0, 5) ?? [], null, 2)}

Provide:
1. summary: A 2-4 sentence analysis of structural health
2. actions: Up to 5 recommended actions as a JSON array of strings
3. severity: one of low | medium | high | critical

Respond ONLY with valid JSON: { "summary": "...", "actions": ["...", "..."], "severity": "..." }`;
}

// ── Data Integrity ─────────────────────────────────────────────────────────────
export function buildDataIntegrityAnalysisPrompt(data: {
  status: string;
  total_issues: number;
  null_checks: unknown[];
  duplicate_checks: unknown[];
  range_checks: unknown[];
  table_row_counts: unknown[];
}): string {
  return `Analyse the following SQL Server data integrity check for the HEQCIS database:

OVERALL STATUS: ${data.status}
TOTAL ISSUES FOUND: ${data.total_issues}

NULL VIOLATIONS:
${JSON.stringify(data.null_checks?.filter((r: unknown) => Number((r as Record<string, unknown>)['null_count']) > 0) ?? [], null, 2)}

DUPLICATE RECORDS:
${JSON.stringify(data.duplicate_checks?.filter((r: unknown) => Number((r as Record<string, unknown>)['duplicate_count']) > 0) ?? [], null, 2)}

DATE/RANGE ANOMALIES:
${JSON.stringify(data.range_checks?.filter((r: unknown) => Number((r as Record<string, unknown>)['anomaly_count']) > 0) ?? [], null, 2)}

TABLE ROW COUNTS (top 5):
${JSON.stringify(data.table_row_counts?.slice(0, 5) ?? [], null, 2)}

Provide:
1. summary: A 2-4 sentence analysis of data quality
2. actions: Up to 5 recommended remediation actions as a JSON array of strings
3. severity: one of low | medium | high | critical

Respond ONLY with valid JSON: { "summary": "...", "actions": ["...", "..."], "severity": "..." }`;
}

// ── Index Maintenance ─────────────────────────────────────────────────────────
export function buildIndexAnalysisPrompt(data: {
  status: string;
  total_indexes: number;
  rebuilt_count: number;
  reorganized_count: number;
  avg_fragmentation_pct: number;
  top_fragmented: unknown[];
  missing_indexes: unknown[];
}): string {
  return `Analyse the following SQL Server index maintenance check for the HEQCIS database:

OVERALL STATUS: ${data.status}
TOTAL INDEXES CHECKED: ${data.total_indexes}
REQUIRING REBUILD (>30% fragmented): ${data.rebuilt_count}
REQUIRING REORGANIZE (10-30%): ${data.reorganized_count}
AVERAGE FRAGMENTATION: ${data.avg_fragmentation_pct}%

MOST FRAGMENTED INDEXES:
${JSON.stringify(data.top_fragmented?.slice(0, 5) ?? [], null, 2)}

MISSING INDEX RECOMMENDATIONS:
${JSON.stringify(data.missing_indexes?.slice(0, 3) ?? [], null, 2)}

Provide:
1. summary: A 2-4 sentence analysis of index health and performance impact
2. actions: Up to 5 specific recommended actions (e.g., which indexes to rebuild, maintenance window scheduling)
3. severity: one of low | medium | high | critical

Respond ONLY with valid JSON: { "summary": "...", "actions": ["...", "..."], "severity": "..." }`;
}
