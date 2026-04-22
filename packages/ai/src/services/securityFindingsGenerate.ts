// packages/ai/src/services/securityFindingsGenerate.ts
// Calls OpenAI to generate realistic security findings from operational context.

import { openai, DEFAULT_MODEL } from '../client.js';
import type { AiResult } from './summarise.js';
import type { SecurityFindingsGenerateInput } from '../prompts/securityFindingsGenerate.js';
import {
  SECURITY_FINDINGS_GENERATE_SYSTEM,
  buildSecurityFindingsPrompt,
} from '../prompts/securityFindingsGenerate.js';

export type { SecurityFindingsGenerateInput };

export interface GeneratedSecurityFinding {
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  source: 'scan' | 'audit' | 'manual' | 'siem';
  affected_system: string;
  status: 'open';
}

export interface SecurityFindingsGenerateResult extends AiResult {
  findings: GeneratedSecurityFinding[];
}

export async function generateSecurityFindings(
  input: SecurityFindingsGenerateInput,
): Promise<SecurityFindingsGenerateResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SECURITY_FINDINGS_GENERATE_SYSTEM },
      { role: 'user', content: buildSecurityFindingsPrompt(input) },
    ],
    max_tokens: 1800,
    temperature: 0.4,
  });

  const raw = response.choices[0]?.message?.content ?? '[]';

  let findings: GeneratedSecurityFinding[] = [];
  try {
    findings = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON for security findings: ${raw.slice(0, 200)}`);
  }

  return {
    findings,
    output: raw,
    prompt_tokens: response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model: response.model,
  };
}
