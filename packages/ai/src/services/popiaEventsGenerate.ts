// packages/ai/src/services/popiaEventsGenerate.ts
// Calls OpenAI to generate realistic POPIA compliance events from operational context.

import { openai, DEFAULT_MODEL } from '../client.js';
import type { AiResult } from './summarise.js';
import type { PopiaEventsGenerateInput } from '../prompts/popiaEventsGenerate.js';
import {
  POPIA_EVENTS_GENERATE_SYSTEM,
  buildPopiaEventsPrompt,
} from '../prompts/popiaEventsGenerate.js';

export type { PopiaEventsGenerateInput };

export interface GeneratedPopiaEvent {
  event_type: 'breach' | 'request' | 'consent' | 'deletion' | 'audit';
  description: string;
  data_subject: string;
  status: 'open';
}

export interface PopiaEventsGenerateResult extends AiResult {
  events: GeneratedPopiaEvent[];
}

export async function generatePopiaEvents(
  input: PopiaEventsGenerateInput,
): Promise<PopiaEventsGenerateResult> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: POPIA_EVENTS_GENERATE_SYSTEM },
      { role: 'user', content: buildPopiaEventsPrompt(input) },
    ],
    max_tokens: 1200,
    temperature: 0.4,
  });

  const raw = response.choices[0]?.message?.content ?? '[]';

  let events: GeneratedPopiaEvent[] = [];
  try {
    events = JSON.parse(raw);
  } catch {
    throw new Error(`AI returned invalid JSON for POPIA events: ${raw.slice(0, 200)}`);
  }

  return {
    events,
    output: raw,
    prompt_tokens: response.usage?.prompt_tokens ?? 0,
    completion_tokens: response.usage?.completion_tokens ?? 0,
    model: response.model,
  };
}
