// packages/ai/src/services/auditLogsAnalyse.ts
// Calls OpenAI to analyse existing audit log entries and surface governance insights.

import { openai, DEFAULT_MODEL } from '../client.js';
import type { AiResult } from './summarise.js';
import type { AuditLogsAnalyseInput } from '../prompts/auditLogsAnalyse.js';
import {
  AUDIT_LOGS_ANALYSE_SYSTEM,
  buildAuditLogsAnalysePrompt,
} from '../prompts/auditLogsAnalyse.js';

export type { AuditLogsAnalyseInput };

export async function analyseAuditLogs(
  input: AuditLogsAnalyseInput,
): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: AUDIT_LOGS_ANALYSE_SYSTEM },
      { role: 'user', content: buildAuditLogsAnalysePrompt(input) },
    ],
    max_tokens: 1600,
    temperature: 0.3,
  });

  return {
    output: response.choices[0]?.message?.content ?? '',
    prompt_tokens: response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model: response.model,
  };
}
