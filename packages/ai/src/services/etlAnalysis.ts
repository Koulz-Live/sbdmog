// packages/ai/src/services/etlAnalysis.ts
// Calls OpenAI to score ETL dataset conformance and recommend improvements.

import { openai, DEFAULT_MODEL }          from '../client.js';
import type { AiResult }                  from './summarise.js';
import type { EtlAnalysisInput }          from '../prompts/etlAnalysis.js';
import {
  ETL_ANALYSIS_SYSTEM,
  buildEtlAnalysisPrompt,
} from '../prompts/etlAnalysis.js';

export type { EtlAnalysisInput };

export async function analyseEtlDataset(
  input: EtlAnalysisInput,
): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model:       DEFAULT_MODEL,
    messages: [
      { role: 'system', content: ETL_ANALYSIS_SYSTEM },
      { role: 'user',   content: buildEtlAnalysisPrompt(input) },
    ],
    max_tokens:  1400,
    temperature: 0.2,  // low temperature — deterministic data analysis
  });

  const choice = response.choices[0];
  return {
    output:            choice?.message?.content ?? '',
    prompt_tokens:     response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model:             response.model,
  };
}
