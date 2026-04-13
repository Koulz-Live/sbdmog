// packages/core/src/validators/backupRun.schema.ts

import { z } from 'zod';

export const createBackupRunSchema = z.object({
  source: z.enum(['webhook', 'manual']),
  database_name: z.string().min(1).max(200),
  backup_type: z.enum(['full', 'differential', 'log']),
  status: z.enum(['success', 'failed', 'running', 'cancelled']),
  started_at: z.string().datetime().optional().nullable(),
  finished_at: z.string().datetime().optional().nullable(),
  size_bytes: z.number().int().nonnegative().optional().nullable(),
  disk_free_bytes_before: z.number().int().nonnegative().optional().nullable(),
  disk_free_bytes_after: z.number().int().nonnegative().optional().nullable(),
  backup_path: z.string().max(1000).optional().nullable(),
  error_message: z.string().max(5000).optional().nullable(),
  remediation_note: z.string().max(5000).optional().nullable(),
});

export const updateBackupRunSchema = createBackupRunSchema.partial();

export type CreateBackupRunInput = z.infer<typeof createBackupRunSchema>;
export type UpdateBackupRunInput = z.infer<typeof updateBackupRunSchema>;
