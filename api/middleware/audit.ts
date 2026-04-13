// api/middleware/audit.ts
// Automatically writes an audit_log row after every mutating API request.
// Reads actor, action, and resource context from req.user and req.auditMeta.

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { adminClient } from '@heqcis/supabase';

export interface AuditMeta {
  resource_type: string;
  resource_id?: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'view';
  metadata?: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auditMeta?: AuditMeta;
    }
  }
}

export async function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Capture the original json method to intercept the response
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    // Only log after a successful mutating operation
    if (req.auditMeta && res.statusCode < 400) {
      const authedReq = req as AuthenticatedRequest;
      const meta      = req.auditMeta;

      // Fire-and-forget — do not block the response
      void adminClient.from('audit_logs').insert({
        actor_id:      authedReq.user?.id ?? null,
        action:        meta.action,
        resource_type: meta.resource_type,
        resource_id:   meta.resource_id ?? null,
        metadata:      meta.metadata ?? null,
        ip_address:    req.ip ?? null,
        user_agent:    req.headers['user-agent'] ?? null,
      });
    }

    return originalJson(body);
  };

  next();
}
