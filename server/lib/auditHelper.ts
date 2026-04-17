// server/lib/auditHelper.ts
// Shared helper for writing audit log rows from anywhere in the server
// (middleware, routes, webhooks). Fire-and-forget — never throws.

import { adminClient } from '@heqcis/supabase';
import type { AuditAction } from '@heqcis/types';

export interface AuditLogPayload {
  actor_id?:     string | null;
  action:        AuditAction;
  resource_type: string;
  resource_id?:  string | null;
  metadata?:     Record<string, unknown> | null;
  ip_address?:   string | null;
  user_agent?:   string | null;
}

/**
 * Insert an audit log row. Fire-and-forget — errors are only logged to console,
 * never propagated to the caller.
 */
export function insertAuditLog(payload: AuditLogPayload): void {
  void adminClient
    .from('audit_logs')
    .insert({
      actor_id:      payload.actor_id      ?? null,
      action:        payload.action,
      resource_type: payload.resource_type,
      resource_id:   payload.resource_id   ?? null,
      metadata:      payload.metadata      ?? null,
      ip_address:    payload.ip_address    ?? null,
      user_agent:    payload.user_agent    ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[auditHelper] insert failed:', error.message);
    });
}
