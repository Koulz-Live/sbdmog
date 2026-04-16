// packages/ai/src/prompts/governanceInsights.ts
// System prompt and data builder for the executive governance insights report.
// Synthesises data across incidents, security, POPIA, submission readiness,
// and change requests into a structured advisory for CHE leadership.

export const GOVERNANCE_INSIGHTS_SYSTEM = `You are an independent IT governance advisor reporting to CHE (Council on Higher Education) executive leadership in South Africa.

You review operational data from the HEQCIS (Higher Education Quality Committee Information System) platform and produce structured governance insights.

Rules:
- Write in formal South African English.
- Be direct and factual. Flag real risks; do not soften critical issues.
- Use the exact data provided — never fabricate numbers.
- Structure your response precisely as requested.
- Tone: executive briefing, not a technical report.
- Keep the total output under 700 words.`;

export interface GovernanceData {
  period: string;
  incidents: {
    open: number;
    p1p2: number;
    resolvedLast30d: number;
    avgResolutionHours: number | null;
  };
  security: {
    openFindings: number;
    criticalFindings: number;
    overdueRemediation: number;
  };
  popia: {
    openEvents: number;
    highSeverityEvents: number;
    unresolvedDays: number | null;
  };
  submissionReadiness: {
    latestScore: number | null;
    latestStatus: string | null;
    blockers: string[];
  };
  changeRequests: {
    pendingApproval: number;
    implementedLast30d: number;
    rejectedLast30d: number;
  };
  backups: {
    successRate7d: number | null;
    lastFailureAt: string | null;
  };
}

export function buildGovernanceInsightsPrompt(data: GovernanceData): string {
  const b = data.backups;
  const i = data.incidents;
  const s = data.security;
  const p = data.popia;
  const sr = data.submissionReadiness;
  const cr = data.changeRequests;

  return `Produce a structured governance insights report for HEQCIS operations. Period: ${data.period}

=== RAW DATA ===

INCIDENTS
- Open incidents: ${i.open} (${i.p1p2} are P1/P2)
- Resolved in last 30 days: ${i.resolvedLast30d}
- Average resolution time: ${i.avgResolutionHours != null ? `${i.avgResolutionHours.toFixed(1)} hours` : 'insufficient data'}

SECURITY FINDINGS
- Open findings: ${s.openFindings} (${s.criticalFindings} critical)
- Overdue for remediation: ${s.overdueRemediation}

POPIA COMPLIANCE EVENTS
- Open events: ${p.openEvents} (${p.highSeverityEvents} high severity)
- Longest unresolved: ${p.unresolvedDays != null ? `${p.unresolvedDays} days` : 'N/A'}

SUBMISSION READINESS
- Latest readiness score: ${sr.latestScore != null ? `${sr.latestScore}%` : 'not assessed'}
- Status: ${sr.latestStatus ?? 'unknown'}
- Active blockers: ${sr.blockers.length > 0 ? sr.blockers.join('; ') : 'none'}

CHANGE REQUESTS
- Pending approval: ${cr.pendingApproval}
- Implemented (last 30d): ${cr.implementedLast30d}
- Rejected (last 30d): ${cr.rejectedLast30d}

BACKUP HEALTH
- 7-day success rate: ${b.successRate7d != null ? `${b.successRate7d.toFixed(1)}%` : 'unknown'}
- Last backup failure: ${b.lastFailureAt ?? 'none recorded'}

=== REQUIRED OUTPUT FORMAT ===

## Executive Governance Summary

[2-3 sentences: overall platform health in plain language]

## Key Risks

[Numbered list of the top risks based on the data. Be specific. Include severity context.]

## POPIA & Compliance Status

[1-2 paragraphs on POPIA events and submission readiness]

## Recommended Actions

[Numbered list of concrete, actionable recommendations for leadership]

## Trend Outlook

[1 paragraph on trajectory — improving, stable, or deteriorating — with rationale]`;
}
