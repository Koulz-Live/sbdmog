// server/middleware/audit.ts
// Enterprise-grade automatic audit logging middleware.
//
// Behaviour:
//   - Generates a unique request_id for every request (attached to X-Request-ID response header).
//   - Captures wall-clock duration for every request.
//   - Automatically derives resource_type, resource_id, and action from the URL + HTTP method.
//   - Logs ALL mutating requests (POST/PATCH/PUT/DELETE) on completion.
//   - Logs view events for designated sensitive GET routes.
//   - Logs 401 (unauthenticated) and 403 (permission_denied) responses.
//   - Logs 5xx system_error events.
//   - Routes can override any field via req.auditMeta for fine-grained context.
//   - Fire-and-forget — never blocks the response.

import { randomUUID }      from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';
import { insertAuditLog, deriveSeverity } from '../lib/auditHelper.js';
import type { AuditAction, AuditSeverity } from '@heqcis/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditMeta {
  resource_type:  string;
  resource_id?:   string;
  action:         AuditAction;
  severity?:      AuditSeverity;
  metadata?:      Record<string, unknown>;
  changes?:       { before: unknown; after: unknown };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auditMeta?: AuditMeta;
      requestId?: string;
      requestStartMs?: number;
    }
  }
}

// ── Path parsing helpers ──────────────────────────────────────────────────────

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT_RE    = /^\d+$/;

/**
 * Strips the /api/ prefix and parses a path into resource_type + resource_id.
 *
 * Examples:
 *   /api/incidents              → { resource_type: 'incidents',  resource_id: null }
 *   /api/incidents/abc-123      → { resource_type: 'incidents',  resource_id: 'abc-123' }
 *   /api/incidents/abc/updates  → { resource_type: 'incidents',  resource_id: 'abc' }
 *   /api/monthly-reports/x/ai/draft → { resource_type: 'monthly_reports', resource_id: 'x' }
 */
function parsePath(path: string): { resource_type: string; resource_id: string | null } {
  // Strip /api/ prefix
  const clean = path.replace(/^\/api\//, '').replace(/^\//, '');
  const parts = clean.split('/').filter(Boolean);

  if (parts.length === 0) return { resource_type: 'api', resource_id: null };

  // First segment is always the resource type — normalise hyphens to underscores
  const resource_type = (parts[0] ?? 'api').replace(/-/g, '_');

  // Second segment is the resource_id if it looks like a UUID or numeric ID
  const second = parts[1] ?? null;
  const resource_id =
    second && (UUID_RE.test(second) || INT_RE.test(second)) ? second : null;

  return { resource_type, resource_id };
}

/**
 * Derives the logical audit action from the HTTP method + URL path.
 * Path suffixes take precedence over HTTP method.
 */
function deriveAction(method: string, path: string): AuditAction {
  const lower = path.toLowerCase();

  // Path-suffix overrides
  if (lower.endsWith('/ai-generate') || lower.includes('/ai/generate')) return 'ai_generate';
  if (lower.endsWith('/ai-analyse')  || lower.includes('/ai/analyse'))  return 'ai_analyse';
  if (lower.endsWith('/ai/draft'))                                       return 'ai_generate';
  if (lower.endsWith('/approve'))                                        return 'approve';
  if (lower.endsWith('/publish'))                                        return 'publish';
  if (lower.endsWith('/reject'))                                         return 'reject';
  if (lower.endsWith('/export'))                                         return 'export';
  if (lower.endsWith('/deactivate'))                                     return 'deactivate';
  if (lower.endsWith('/reactivate'))                                     return 'reactivate';
  if (lower.endsWith('/password-reset'))                                 return 'password_reset';
  if (lower.endsWith('/role'))                                           return 'role_change';
  if (lower.includes('/upload'))                                         return 'upload';

  // HTTP method fallback
  switch (method.toUpperCase()) {
    case 'POST':   return 'create';
    case 'PATCH':
    case 'PUT':    return 'update';
    case 'DELETE': return 'delete';
    case 'GET':    return 'view';
    default:       return 'view';
  }
}

// Resources where GET (view/list/search) events should be audited
const SENSITIVE_GET_RESOURCES = new Set([
  'users', 'audit_logs', 'profiles', 'security_findings', 'popia_events',
]);

// ── Middleware ────────────────────────────────────────────────────────────────

export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Attach request correlation ID
  const requestId  = randomUUID();
  const startMs    = Date.now();
  req.requestId    = requestId;
  req.requestStartMs = startMs;
  res.setHeader('X-Request-ID', requestId);

  // Intercept res.json to log after the response is sent
  const originalJson = res.json.bind(res);

  res.json = (body: unknown) => {
    const result   = originalJson(body);
    const status   = res.statusCode;
    const duration = Date.now() - startMs;
    const authed   = req as AuthenticatedRequest;
    const actorId  = authed.user?.id ?? null;

    // ── Always log security/error responses ──────────────────────────────────

    if (status === 401) {
      insertAuditLog({
        actor_id:      actorId,
        action:        'unauthenticated',
        resource_type: 'api',
        severity:      'high',
        http_method:   req.method,
        http_path:     req.path,
        http_status:   status,
        duration_ms:   duration,
        request_id:    requestId,
        ip_address:    req.ip ?? null,
        user_agent:    req.headers['user-agent'] ?? null,
        metadata:      { path: req.path, method: req.method },
      });
      return result;
    }

    if (status === 403) {
      const { resource_type, resource_id } = parsePath(req.path);
      insertAuditLog({
        actor_id:      actorId,
        action:        'permission_denied',
        resource_type,
        resource_id,
        severity:      deriveSeverity('permission_denied', resource_type),
        http_method:   req.method,
        http_path:     req.path,
        http_status:   status,
        duration_ms:   duration,
        request_id:    requestId,
        ip_address:    req.ip ?? null,
        user_agent:    req.headers['user-agent'] ?? null,
        metadata:      { role: authed.user?.role ?? null, path: req.path, method: req.method },
      });
      return result;
    }

    if (status >= 500) {
      const { resource_type, resource_id } = parsePath(req.path);
      insertAuditLog({
        actor_id:      actorId,
        action:        'system_error',
        resource_type,
        resource_id,
        severity:      'high',
        http_method:   req.method,
        http_path:     req.path,
        http_status:   status,
        duration_ms:   duration,
        request_id:    requestId,
        ip_address:    req.ip ?? null,
        user_agent:    req.headers['user-agent'] ?? null,
        metadata:      { path: req.path, method: req.method },
      });
      return result;
    }

    // ── Skip 2xx/3xx GETs unless sensitive resource or explicit auditMeta ────
    const isGet = req.method.toUpperCase() === 'GET';
    if (isGet) {
      const { resource_type } = parsePath(req.path);
      const isSensitiveGet    = SENSITIVE_GET_RESOURCES.has(resource_type);
      const hasExplicitMeta   = !!req.auditMeta;
      if (!isSensitiveGet && !hasExplicitMeta) return result;
    }

    // ── Log successful mutating requests or sensitive GETs ───────────────────
    if (status >= 200 && status < 300) {
      const meta = req.auditMeta;

      if (meta) {
        // Route-provided context — use as-is
        insertAuditLog({
          actor_id:      actorId,
          action:        meta.action,
          resource_type: meta.resource_type,
          resource_id:   meta.resource_id ?? null,
          metadata:      meta.metadata    ?? null,
          changes:       meta.changes     ?? null,
          severity:      meta.severity    ?? deriveSeverity(meta.action, meta.resource_type, status),
          http_method:   req.method,
          http_path:     req.path,
          http_status:   status,
          duration_ms:   duration,
          request_id:    requestId,
          ip_address:    req.ip ?? null,
          user_agent:    req.headers['user-agent'] ?? null,
        });
      } else {
        // Auto-derived context from URL + method
        const { resource_type, resource_id } = parsePath(req.path);
        const action = deriveAction(req.method, req.path);
        insertAuditLog({
          actor_id:      actorId,
          action,
          resource_type,
          resource_id,
          severity:      deriveSeverity(action, resource_type, status),
          http_method:   req.method,
          http_path:     req.path,
          http_status:   status,
          duration_ms:   duration,
          request_id:    requestId,
          ip_address:    req.ip ?? null,
          user_agent:    req.headers['user-agent'] ?? null,
        });
      }
    }

    return result;
  };

  next();
}
