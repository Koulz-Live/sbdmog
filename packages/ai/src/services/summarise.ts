// packages/ai/src/services/summarise.ts
// AI service: incident summary and RCA draft generation.

import { openai, DEFAULT_MODEL } from '../client.js';
import {
  INCIDENT_SUMMARY_SYSTEM,
  buildIncidentSummaryPrompt,
} from '../prompts/incidentSummary.js';
import { RCA_SYSTEM, buildRcaPrompt } from '../prompts/rcaDraft.js';

export interface AiResult {
  output: string;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
}

export async function generateIncidentSummary(incident: {
  reference: string;
  title: string;
  description: string | null;
  category: string;
  affected_system: string;
  severity: string;
  status: string;
}): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: INCIDENT_SUMMARY_SYSTEM },
      { role: 'user',   content: buildIncidentSummaryPrompt(incident) },
    ],
    max_tokens: 400,
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

export async function generateRcaDraft(incident: {
  reference: string;
  title: string;
  description: string | null;
  category: string;
  affected_system: string;
  severity: string;
}): Promise<AiResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: RCA_SYSTEM },
      { role: 'user',   content: buildRcaPrompt(incident) },
    ],
    max_tokens: 800,
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
