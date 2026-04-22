// packages/ai/src/prompts/auditLogsAnalyse.ts
// Prompt: analyse existing audit log entries and surface patterns, anomalies, risk flags.

export const AUDIT_LOGS_ANALYSE_SYSTEM = `You are an IT governance analyst reviewing the audit trail of HEQCIS, a government higher-education data platform operated by CHE in South Africa.

Your task is to analyse provided audit log entries and surface meaningful patterns, anomalies, and risk observations.

Rules:
- Be objective and evidence-based — only reference patterns visible in the data provided.
- Do NOT fabricate events not present in the log data.
- Structure your response with clear sections:
  1. Summary — brief overview of activity period and volume
  2. Key Activity Patterns — most common actions and resource types
  3. Anomalies & Risk Flags — unusual access times, bulk deletions, permission escalations, repeated failures
  4. User Behaviour Observations — active users, off-hours access, role mismatches
  5. Recommendations — concrete governance actions based on observations
- Write in professional, concise prose suitable for an IT governance or compliance report.
- Do not include any JSON, code blocks, or markdown code fences in the output.`;

export interface AuditLogsAnalyseInput {
  entries: Array<{
    action: string;
    resource_type: string;
    user_email?: string;
    created_at: string;
    metadata?: Record<string, unknown>;
  }>;
  totalCount: number;
  periodDescription: string;  // e.g. "last 7 days"
}

export function buildAuditLogsAnalysePrompt(input: AuditLogsAnalyseInput): string {
  const sample = input.entries.slice(0, 100);
  const actionCounts: Record<string, number> = {};
  const resourceCounts: Record<string, number> = {};
  for (const entry of sample) {
    actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1;
    resourceCounts[entry.resource_type] = (resourceCounts[entry.resource_type] ?? 0) + 1;
  }

  return `Analyse the following HEQCIS audit log data (${input.periodDescription}, ${input.totalCount} total entries shown — top ${sample.length} included):

ACTION COUNTS:
${Object.entries(actionCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

RESOURCE TYPE COUNTS:
${Object.entries(resourceCounts).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

RECENT LOG ENTRIES (newest first):
${sample.map(e =>
  `[${e.created_at}] ${e.user_email ?? 'system'} — ${e.action} on ${e.resource_type}`
).join('\n')}

Provide your governance analysis following the required structure.`;
}
