// packages/ai/src/services/governanceInsights.ts

import { openai, DEFAULT_MODEL }       from '../client.js';
import type { AiResult }               from './summarise.js';
import type { GovernanceData }         from '../prompts/governanceInsights.js';
import {
  GOVERNANCE_INSIGHTS_SYSTEM,
  buildGovernanceInsightsPrompt,
} from '../prompts/governanceInsights.js';

export type { GovernanceData };

export async function generateGovernanceInsights(
  data: GovernanceData,
): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: GOVERNANCE_INSIGHTS_SYSTEM },
      { role: 'user',   content: buildGovernanceInsightsPrompt(data) },
    ],
    max_tokens: 1200,
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
