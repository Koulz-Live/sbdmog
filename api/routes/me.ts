// api/routes/me.ts
// GET /api/me — returns the authenticated user's profile.

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const meRouter = Router();

meRouter.get('/', (req, res: Response) => {
  const authed = req as AuthenticatedRequest;
  res.json({ data: authed.user });
});
