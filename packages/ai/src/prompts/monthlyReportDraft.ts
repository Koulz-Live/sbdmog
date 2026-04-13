// packages/ai/src/prompts/monthlyReportDraft.ts

export const MONTHLY_REPORT_SYSTEM = `You are a senior IT operations manager at CHE preparing the monthly HEQCIS operational report.
Reports are reviewed by CHE executive leadership and the service provider.

Rules:
- Write professionally in formal South African English.
- Each section should be 2–4 paragraphs.
- Focus on factual summary, trends, and forward outlook.
- Do not fabricate statistics; use only data provided.
- Tone: confident, measured, clear.`;

export function buildMonthlyReportPrompt(
  period: string,
  data: {
    incidents: string;
    backupEtl: string;
    changeRequests: string;
    securityPopia: string;
    submissionReadiness: string;
    upcomingWork: string;
  },
): string {
  return `Draft the monthly HEQCIS operational report for period: ${period}

--- INCIDENTS ---
${data.incidents}

--- BACKUP & ETL ---
${data.backupEtl}

--- CHANGE REQUESTS ---
${data.changeRequests}

--- SECURITY & POPIA ---
${data.securityPopia}

--- SUBMISSION READINESS ---
${data.submissionReadiness}

--- UPCOMING WORK ---
${data.upcomingWork}

Generate a complete, well-structured monthly report covering all sections above.`;
}
