// api/routes/dashboard.ts
// GET /api/dashboard — returns aggregated ops summary cards.

import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { adminClient, getDashboardSummary } from '@heqcis/supabase';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res: Response) => {
  try {
    const summary = await getDashboardSummary(adminClient);
    res.json(summary);
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});
