// packages/ai/src/prompts/popiaEventsGenerate.ts
// Prompt: generate realistic POPIA compliance events from operational context.

export const POPIA_EVENTS_GENERATE_SYSTEM = `You are a POPIA (Protection of Personal Information Act) compliance officer for HEQCIS at CHE, South Africa.

Your task is to generate realistic, plausible POPIA compliance events based on the operational context provided.

Rules:
- Generate between 2 and 4 POPIA events.
- Events must be realistic for a government higher-education data platform handling student and institution records.
- event_type must be one of: breach, request, consent, deletion, audit
- status must be: open
- Return ONLY a valid JSON array — no markdown, no explanation, no code fences.

Output format (strict JSON array):
[
  {
    "event_type": "breach|request|consent|deletion|audit",
    "description": "string — detailed description of the event",
    "data_subject": "string — category of data subject, e.g. 'Student records', 'Institution contacts'"
  }
]`;

export interface PopiaEventsGenerateInput {
  recentEtlUploads: number;
  openSecurityFindings: number;
  period: string;  // e.g. "April 2026"
}

export function buildPopiaEventsPrompt(input: PopiaEventsGenerateInput): string {
  return `Generate POPIA compliance events for HEQCIS based on the following context:

- Recent ETL data uploads in the last 30 days: ${input.recentEtlUploads}
- Open security findings: ${input.openSecurityFindings}
- Current period: ${input.period}

Consider realistic POPIA events such as:
- Data subject access requests from students or institutions
- Consent management reviews for data processing activities
- Data deletion requests following submissions
- Scheduled POPIA compliance audits
- Potential minor breach notifications (e.g. misconfigured access, over-retention)

Return ONLY the JSON array.`;
}
