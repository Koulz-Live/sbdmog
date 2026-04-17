// api/middleware/auth.ts
// Verifies the Supabase JWT from the Authorization header.
// Attaches the resolved profile (with role) to req.user.

import type { Request, Response, NextFunction } from 'express';
import { adminClient } from '@heqcis/supabase';
import type { Profile } from '@heqcis/types';
import { insertAuditLog } from '../lib/auditHelper.js';

export interface AuthenticatedRequest extends Request {
  user: Profile;
  token: string;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = header.slice(7);

  // Verify the JWT via Supabase Auth
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) {
    insertAuditLog({
      action:        'login_failed',
      resource_type: 'user_session',
      ip_address:    req.ip ?? null,
      user_agent:    req.headers['user-agent'] ?? null,
      metadata:      { reason: 'invalid_or_expired_token', path: req.path },
    });
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  // Fetch the user's profile (includes role, department, etc.)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    res.status(403).json({ error: 'User profile not found.' });
    return;
  }

  (req as AuthenticatedRequest).user  = profile as Profile;
  (req as AuthenticatedRequest).token = token;

  next();
}
