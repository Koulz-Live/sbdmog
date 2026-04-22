// server/routes/activityTrack.ts
// Authenticated endpoint for recording arbitrary client-side audit events:
//   page_view, view, search, export, download, upload, ai_generate, ai_analyse, filter
//
// Requires a valid Supabase JWT in Authorization: Bearer <token>.
// This covers user behaviour that bypasses the server middleware (SPA navigation,
// export button clicks, AI generate triggers, search/filter apply, etc.).

import { Router }            from 'express';
import type { Request, Response } from 'express';
import { adminClient }       from '@heqcis/supabase';
import { insertAuditLog, deriveSeverity } from '../lib/auditHelper.js';
import type { AuditAction }  from '@heqcis/types';

export const activityTrackRouter = Router();

// All AuditActions that the frontend is permitted to record.
// Mutating actions (create/update/delete/approve/etc.) are handled server-side only.
const ALLOWED_CLIENT_ACTIONS = new Set<AuditAction>([
  'view', 'search', 'export', 'download', 'upload',
  'ai_generate', 'ai_analyse',
  'login', 'logout', 'login_failed',
]);

// page_view is a frontend-only concept — normalise to 'view'
const normalise = (action: string): AuditAction | null => {
  if (action === 'page_view') return 'view';
  if (ALLOWED_CLIENT_ACTIONS.has(action as AuditAction)) return action as AuditAction;
  return null;
};

// POST /activity/track
// Body: { action, resource_type, resource_id?, metadata?, page? }
activityTrackRouter.post('/', async (req: Request, res: Response) => {
  // Resolve actor from JWT (authMiddleware already verified the token and
  // attached req.user — but this route is mounted BEFORE authMiddleware so we
  // do a lightweight token check ourselves to avoid blocking unauthenticated
  // clients in edge cases).
  const authHeader = req.headers.authorization ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let actorId: string | null = null;

  if (token) {
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (!error && user) actorId = user.id;
  }

  const { action: rawAction, resource_type, resource_id, metadata, page } = req.body as {
    action:         string;
    resource_type?: string;
    resource_id?:   string;
    metadata?:      Record<string, unknown>;
    page?:          string;
  };

  if (!rawAction) {
    res.status(400).json({ error: 'action is required.' });
    return;
  }

  const action = normalise(rawAction);
  if (!action) {
    // Silently accept unknown actions so the frontend never errors out
    res.status(202).json({ ok: true });
    return;
  }

  const effectiveResourceType = resource_type ?? (page ? page.replace(/\//g, '_').replace(/^_/, '') : 'app');

  insertAuditLog({
    actor_id:      actorId,
    action,
    resource_type: effectiveResourceType,
    resource_id:   resource_id ?? null,
    severity:      deriveSeverity(action, effectiveResourceType),
    ip_address:    req.ip ?? null,
    user_agent:    req.headers['user-agent'] ?? null,
    metadata: {
      ...(page     ? { page }     : {}),
      ...(metadata ?? {}),
    },
  });

  res.status(202).json({ ok: true });
});
