// packages/core/src/validators/incident.schema.ts

import { z } from 'zod';

export const createIncidentSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum([
    'system_outage',
    'performance_degradation',
    'data_quality',
    'security_event',
    'integration_failure',
    'other',
  ]),
  affected_system: z.enum([
    'HEQCIS',
    'NLRD',
    'SAQA',
    'DHET',
    'ETL_Pipeline',
    'Backup_System',
    'Reporting',
    'Auth',
    'Other',
  ]),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
  assigned_to: z.string().uuid().optional().nullable(),
  sla_breach_at: z.string().datetime().optional().nullable(),
});

export const updateIncidentSchema = createIncidentSchema.partial().extend({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  resolved_at: z.string().datetime().optional().nullable(),
});

export const createIncidentUpdateSchema = z.object({
  content: z.string().min(1).max(10_000),
});

export type CreateIncidentInput  = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput  = z.infer<typeof updateIncidentSchema>;
export type CreateIncidentUpdateInput = z.infer<typeof createIncidentUpdateSchema>;
