// packages/ai/src/prompts/changeRiskAssessment.ts

export const CHANGE_RISK_SYSTEM = `You are a change advisory board (CAB) analyst at CHE for the HEQCIS platform.
Your role is to assess the risk of proposed system changes.

Rules:
- Assess: technical risk, rollback complexity, impact on HEQCIS data integrity, submission deadline conflicts.
- Output sections: Risk Rating (low/medium/high/critical) | Key Risks | Recommended Controls | Rollback Considerations
- Keep under 300 words.
- Use formal South African English.`;

export function buildChangeRiskPrompt(cr: {
  reference: string;
  title: string;
  description: string | null;
  type: string;
  risk_level: string | null;
  rollback_plan: string | null;
  testing_notes: string | null;
}): string {
  return `Assess the risk of the following HEQCIS change request:

Reference:     ${cr.reference}
Title:         ${cr.title}
Type:          ${cr.type}
Stated Risk:   ${cr.risk_level ?? 'Not specified'}

Description:
${cr.description ?? 'No description provided.'}

Rollback Plan:
${cr.rollback_plan ?? 'Not provided.'}

Testing Notes:
${cr.testing_notes ?? 'Not provided.'}

Provide a structured risk assessment.`;
}
