// api/routes/auditLogs.ts
// Read-only endpoint — admin only. No create/update/delete via API.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requireRole } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const auditLogsRouter = Router();

auditLogsRouter.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const {
      actor_id,
      resource_type,
      action,
      limit = '50',
      offset = '0',
    } = req.query as Record<string, string>;

    let q = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (actor_id)      q = q.eq('actor_id', actor_id);
    if (resource_type) q = q.eq('resource_type', resource_type);
    if (action)        q = q.eq('action', action);

    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[auditLogs:list]', err);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});
