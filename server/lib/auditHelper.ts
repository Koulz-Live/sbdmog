// server/lib/auditHelper.ts
// Shared helper for writing audit log rows from anywhere in the server
// (middleware, routes, webhooks). Fire-and-forget — never throws.

import { adminClient } from '@heqcis/supabase';
import type { AuditAction, AuditSeverity } from '@heqcis/types';

export interface AuditLogPayload {
  actor_id?:     string | null;
  action:        AuditAction;
  resource_type: string;
  resource_id?:  string | null;
  metadata?:     Record<string, unknown> | null;
  changes?:      { before: unknown; after: unknown } | null;
  severity?:     AuditSeverity;
  ip_address?:   string | null;
  user_agent?:   string | null;
  http_method?:  string | null;
  http_path?:    string | null;
  http_status?:  number | null;
  duration_ms?:  number | null;
  request_id?:   string | null;
}

/**
 * Derives a severity level for an audit event based on action + context.
 * Routes can override by passing `severity` explicitly.
 */
export function deriveSeverity(
  action: AuditAction,
  resource_type?: string,
  http_status?: number | null,
): AuditSeverity {
  // HTTP errors
  if (http_status && http_status >= 500) return 'high';

  switch (action) {
    // Critical — irreversible or security-breaking
    case 'permission_denied':
      return resource_type === 'audit_logs' || resource_type === 'profiles' ? 'critical' : 'high';
    case 'unauthenticated':  return 'high';
    case 'login_failed':     return 'medium';
    case 'role_change':      return 'critical';
    case 'deactivate':       return 'high';
    case 'system_error':     return 'high';

    // High — permanent data changes
    case 'delete':   return 'high';
    case 'approve':  return 'high';
    case 'publish':  return 'high';
    case 'reject':   return 'medium';
    case 'reactivate': return 'high';
    case 'password_reset': return 'high';

    // Medium — data mutations
    case 'create':       return 'medium';
    case 'update':       return 'medium';
    case 'upload':       return 'medium';
    case 'ai_generate':  return 'medium';

    // Low — data access
    case 'export':      return 'low';
    case 'download':    return 'low';
    case 'ai_analyse':  return 'low';
    case 'search':      return 'low';
    case 'view':        return 'info';

    // Info — routine
    case 'login':            return 'info';
    case 'logout':           return 'info';
    case 'webhook_received': return 'info';

    default: return 'info';
  }
}

/**
 * Insert an audit log row. Fire-and-forget — errors are only logged to console,
 * never propagated to the caller.
 */
export function insertAuditLog(payload: AuditLogPayload): void {
  const severity = payload.severity ?? deriveSeverity(payload.action, payload.resource_type, payload.http_status);

  void adminClient
    .from('audit_logs')
    .insert({
      actor_id:      payload.actor_id      ?? null,
      action:        payload.action,
      resource_type: payload.resource_type,
      resource_id:   payload.resource_id   ?? null,
      metadata:      payload.metadata      ?? null,
      changes:       payload.changes       ?? null,
      severity,
      ip_address:    payload.ip_address    ?? null,
      user_agent:    payload.user_agent    ?? null,
      http_method:   payload.http_method   ?? null,
      http_path:     payload.http_path     ?? null,
      http_status:   payload.http_status   ?? null,
      duration_ms:   payload.duration_ms   ?? null,
      request_id:    payload.request_id    ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[auditHelper] insert failed:', error.message);
    });
}
