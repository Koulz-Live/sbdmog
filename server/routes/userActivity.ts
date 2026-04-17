// server/routes/userActivity.ts
// Unauthenticated endpoint for recording user session events:
//   login, logout, login_failed
// Called directly from the frontend after Supabase auth operations.
// Rate-limited at the infra level (Vercel edge); no JWT required.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { insertAuditLog } from '../lib/auditHelper.js';

export const userActivityRouter = Router();

const ALLOWED_EVENTS = new Set(['login', 'logout', 'login_failed']);

// POST /activity/user
userActivityRouter.post('/', async (req: Request, res: Response) => {
  const { event, user_id, email, metadata } = req.body as {
    event:      string;
    user_id?:   string;
    email?:     string;
    metadata?:  Record<string, unknown>;
  };

  if (!event || !ALLOWED_EVENTS.has(event)) {
    res.status(400).json({ error: 'Invalid event type. Must be login | logout | login_failed.' });
    return;
  }

  insertAuditLog({
    actor_id:      user_id ?? null,
    action:        event as 'login' | 'logout' | 'login_failed',
    resource_type: 'user_session',
    ip_address:    req.ip ?? null,
    user_agent:    req.headers['user-agent'] ?? null,
    metadata: {
      ...(email    ? { email }    : {}),
      ...(metadata ?? {}),
    },
  });

  // Update last_login_at on successful login
  if (event === 'login' && user_id) {
    void adminClient
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user_id)
      .then(() => {/* no-op */});
  }

  res.status(202).json({ ok: true });
});
