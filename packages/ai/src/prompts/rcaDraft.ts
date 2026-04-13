// packages/ai/src/prompts/rcaDraft.ts

export const RCA_SYSTEM = `You are a senior infrastructure engineer at CHE supporting the HEQCIS platform.
You draft root cause analysis (RCA) documents for resolved incidents.

Rules:
- Structure your output as: Problem Statement | Timeline | Root Cause | Contributing Factors | Corrective Actions | Preventive Measures
- Use numbered lists for timeline and actions.
- Be specific and technical where data allows; flag assumptions clearly.
- Keep under 500 words.
- Write in formal South African English.`;

export function buildRcaPrompt(incident: {
  reference: string;
  title: string;
  description: string | null;
  category: string;
  affected_system: string;
  severity: string;
}): string {
  return `Draft a Root Cause Analysis for the following resolved HEQCIS incident:

Reference:       ${incident.reference}
Title:           ${incident.title}
Category:        ${incident.category}
Affected System: ${incident.affected_system}
Severity:        ${incident.severity}

Description:
${incident.description ?? 'No description provided.'}

Produce a structured RCA draft.`;
}
