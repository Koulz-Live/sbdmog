// packages/types/src/audit.ts

export type AuditAction =
  // CRUD
  | 'create' | 'update' | 'delete'
  // Workflow
  | 'approve' | 'reject' | 'publish'
  // Access / sessions
  | 'view' | 'login' | 'logout' | 'login_failed'
  // Data operations
  | 'export' | 'upload' | 'download' | 'search'
  // AI operations
  | 'ai_generate' | 'ai_analyse'
  // Security events
  | 'permission_denied' | 'unauthenticated'
  // Administrative
  | 'role_change' | 'deactivate' | 'reactivate' | 'password_reset'
  // System / automation
  | 'webhook_received' | 'system_error';

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AuditLog {
  id:            string;
  actor_id:      string | null;
  action:        AuditAction;
  resource_type: string;
  resource_id:   string | null;
  metadata:      Record<string, unknown> | null;
  changes:       { before: unknown; after: unknown } | null;
  severity:      AuditSeverity;
  ip_address:    string | null;
  user_agent:    string | null;
  http_method:   string | null;
  http_path:     string | null;
  http_status:   number | null;
  duration_ms:   number | null;
  request_id:    string | null;
  created_at:    string;
}
