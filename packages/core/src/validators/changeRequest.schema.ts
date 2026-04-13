// packages/core/src/validators/changeRequest.schema.ts

import { z } from 'zod';

export const createChangeRequestSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().max(10_000).optional().nullable(),
  type: z.enum(['standard', 'emergency', 'normal']),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).optional().nullable(),
  scheduled_date: z.string().date().optional().nullable(),
  rollback_plan: z.string().max(10_000).optional().nullable(),
  testing_notes: z.string().max(10_000).optional().nullable(),
});

export const updateChangeRequestSchema = createChangeRequestSchema.partial().extend({
  status: z
    .enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented', 'closed'])
    .optional(),
  implemented_at: z.string().datetime().optional().nullable(),
});

export const approveChangeRequestSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'abstained']),
  comments: z.string().max(5000).optional().nullable(),
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export type UpdateChangeRequestInput = z.infer<typeof updateChangeRequestSchema>;
export type ApproveChangeRequestInput = z.infer<typeof approveChangeRequestSchema>;
