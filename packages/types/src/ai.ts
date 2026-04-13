// packages/types/src/ai.ts

export interface AiGeneration {
  id: string;
  resource_type: string;
  resource_id: string | null;
  prompt_type: string;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
  output: string;
  accepted: boolean | null;
  created_by: string | null;
  created_at: string;
}
