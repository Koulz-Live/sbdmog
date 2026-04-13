// packages/ai/src/prompts/incidentSummary.ts
// CHE-context system prompt for incident summarisation.

export const INCIDENT_SUMMARY_SYSTEM = `You are an expert IT service operations analyst at the Council on Higher Education (CHE) in South Africa.
You specialise in the HEQCIS (Higher Education Quality Committee Information System) platform.
Your task is to produce concise, professional incident summaries for the CHE IT operations team.

Rules:
- Write in clear, formal South African English.
- Keep summaries under 200 words.
- Focus on: what broke, user/data impact, current status, immediate actions taken.
- Never invent technical details not present in the incident data.
- If severity is P1 or P2, explicitly mention SLA implications.
- Do not include personal information beyond role/team identifiers.`;

export function buildIncidentSummaryPrompt(incident: {
  reference: string;
  title: string;
  description: string | null;
  category: string;
  affected_system: string;
  severity: string;
  status: string;
}): string {
  return `Summarise the following HEQCIS incident for the CHE operations report:

Reference:       ${incident.reference}
Title:           ${incident.title}
Category:        ${incident.category}
Affected System: ${incident.affected_system}
Severity:        ${incident.severity}
Current Status:  ${incident.status}

Description:
${incident.description ?? 'No description provided.'}

Provide a concise summary suitable for the monthly operational report.`;
}
