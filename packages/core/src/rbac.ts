// packages/core/src/rbac.ts
// Role-Based Access Control helper.
// Mirrors the RLS policies defined in the Supabase migrations.

import type { Role } from '@heqcis/types';

export type { Role };

type Resource =
  | 'incidents'
  | 'incident_updates'
  | 'backup_runs'
  | 'etl_runs'
  | 'maintenance_activities'
  | 'report_requests'
  | 'submission_readiness'
  | 'security_findings'
  | 'access_reviews'
  | 'popia_events'
  | 'change_requests'
  | 'change_request_approvals'
  | 'documents'
  | 'monthly_reports'
  | 'handover_items'
  | 'audit_logs'
  | 'ai_generations'
  | 'profiles';

type Action = 'read' | 'create' | 'update' | 'delete' | 'approve';

// Permissions matrix: resource -> action -> roles that may perform it
const PERMISSIONS: Record<Resource, Partial<Record<Action, Role[]>>> = {
  incidents: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  incident_updates: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  backup_runs: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  etl_runs: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  maintenance_activities: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  report_requests: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer', 'analyst'],
    update: ['admin', 'engineer', 'analyst'],
    delete: ['admin'],
  },
  submission_readiness: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'analyst'],
    update: ['admin', 'analyst'],
    delete: ['admin'],
  },
  security_findings: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  access_reviews: {
    read:   ['admin'],
    create: ['admin'],
    update: ['admin'],
    delete: ['admin'],
  },
  popia_events: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  change_requests: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  change_request_approvals: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin'],
    approve: ['admin'],
    delete: ['admin'],
  },
  documents: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  monthly_reports: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'analyst'],
    update: ['admin', 'analyst'],
    approve: ['admin'],
    delete: ['admin'],
  },
  handover_items: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    create: ['admin', 'engineer'],
    update: ['admin', 'engineer'],
    delete: ['admin'],
  },
  audit_logs: {
    read:   ['admin'],
    // insert is server-side only; client cannot create audit logs directly
  },
  ai_generations: {
    read:   ['admin', 'engineer', 'analyst'],
    create: ['admin', 'engineer', 'analyst'],
    update: ['admin', 'engineer', 'analyst'],
    delete: ['admin'],
  },
  profiles: {
    read:   ['admin', 'engineer', 'analyst', 'viewer'],
    update: ['admin', 'engineer', 'analyst', 'viewer'], // own only — enforced by RLS
    delete: ['admin'],
  },
};

/**
 * Returns true if the given role is permitted to perform `action` on `resource`.
 *
 * @example
 * if (!can(profile.role, 'create', 'incidents')) throw new ForbiddenError();
 */
export function can(role: Role, action: Action, resource: Resource): boolean {
  const allowed = PERMISSIONS[resource]?.[action];
  if (!allowed) return false;
  return allowed.includes(role);
}
