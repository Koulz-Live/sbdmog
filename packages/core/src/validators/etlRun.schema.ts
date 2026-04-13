// packages/core/src/validators/etlRun.schema.ts

import { z } from 'zod';

export const createEtlRunSchema = z.object({
  source: z.enum(['webhook', 'manual']),
  job_name: z.string().min(1).max(200),
  pipeline_name: z.string().max(200).optional().nullable(),
  status: z.enum(['success', 'failed', 'running', 'cancelled']),
  rows_processed: z.number().int().nonnegative().optional().nullable(),
  rows_failed: z.number().int().nonnegative().optional().nullable(),
  started_at: z.string().datetime().optional().nullable(),
  finished_at: z.string().datetime().optional().nullable(),
  error_message: z.string().max(5000).optional().nullable(),
  restart_required: z.boolean().optional(),
  restart_completed_at: z.string().datetime().optional().nullable(),
});

export const updateEtlRunSchema = createEtlRunSchema.partial();

export type CreateEtlRunInput = z.infer<typeof createEtlRunSchema>;
export type UpdateEtlRunInput = z.infer<typeof updateEtlRunSchema>;
