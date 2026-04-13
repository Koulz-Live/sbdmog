// packages/ai/src/services/draftReport.ts
// AI service: monthly report drafting and change risk assessment.

import { openai, DEFAULT_MODEL } from '../client.js';
import type { AiResult } from './summarise.js';
import {
  MONTHLY_REPORT_SYSTEM,
  buildMonthlyReportPrompt,
} from '../prompts/monthlyReportDraft.js';
import {
  CHANGE_RISK_SYSTEM,
  buildChangeRiskPrompt,
} from '../prompts/changeRiskAssessment.js';
import {
  DOC_ASSIST_SYSTEM,
  buildDocAssistPrompt,
} from '../prompts/documentationAssist.js';

export async function generateMonthlyReportDraft(
  period: string,
  data: {
    incidents: string;
    backupEtl: string;
    changeRequests: string;
    securityPopia: string;
    submissionReadiness: string;
    upcomingWork: string;
  },
): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: MONTHLY_REPORT_SYSTEM },
      { role: 'user',   content: buildMonthlyReportPrompt(period, data) },
    ],
    max_tokens: 2000,
    temperature: 0.4,
  });

  const choice = response.choices[0];
  return {
    output:            choice?.message?.content ?? '',
    prompt_tokens:     response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model:             response.model,
  };
}

export async function generateChangeRiskAssessment(cr: {
  reference: string;
  title: string;
  description: string | null;
  type: string;
  risk_level: string | null;
  rollback_plan: string | null;
  testing_notes: string | null;
}): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: CHANGE_RISK_SYSTEM },
      { role: 'user',   content: buildChangeRiskPrompt(cr) },
    ],
    max_tokens: 600,
    temperature: 0.3,
  });

  const choice = response.choices[0];
  return {
    output:            choice?.message?.content ?? '',
    prompt_tokens:     response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model:             response.model,
  };
}

export async function generateDocumentationDraft(
  docType: string,
  title: string,
  context: string,
): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: DOC_ASSIST_SYSTEM },
      { role: 'user',   content: buildDocAssistPrompt(docType, title, context) },
    ],
    max_tokens: 1500,
    temperature: 0.4,
  });

  const choice = response.choices[0];
  return {
    output:            choice?.message?.content ?? '',
    prompt_tokens:     response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model:             response.model,
  };
}
