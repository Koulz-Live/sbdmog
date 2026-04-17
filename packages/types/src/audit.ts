// packages/types/src/audit.ts

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'approve' | 'view'
  | 'login'  | 'logout' | 'login_failed';

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
