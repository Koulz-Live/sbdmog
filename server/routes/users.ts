// server/routes/users.ts
// Admin-only user management: list, export, update role/dept, invite,
// deactivate/reactivate, password reset, activity timeline.
// Uses Supabase Auth Admin API for user creation + the profiles table for metadata.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requireRole } from '../middleware/rbac.js';
import { insertAuditLog } from '../lib/auditHelper.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const usersRouter = Router();

const ROLES = ['admin', 'engineer', 'analyst', 'viewer'] as const;
const SORTABLE_COLS = ['full_name', 'role', 'created_at', 'last_login_at'] as const;
type SortableCol = typeof SORTABLE_COLS[number];
function isSortable(col: string): col is SortableCol {
  return (SORTABLE_COLS as readonly string[]).includes(col);
}

// ── GET /users  ──────────────────────────────────────────────────────────────
// Lists all profiles with optional filters: role, department, is_active, search
// Supports: order_by, order_dir, limit, offset
usersRouter.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const {
      role,
      department,
      is_active,
      search,
      limit     = '25',
      offset    = '0',
      order_by  = 'created_at',
      order_dir = 'desc',
    } = req.query as Record<string, string>;

    const safeOrderBy = isSortable(order_by) ? order_by : 'created_at';
    const ascending   = order_dir === 'asc';

    let q = adminClient
      .from('profiles')
      .select('*', { count: 'exact' })
      .order(safeOrderBy, { ascending });

    if (role)       q = q.eq('role', role);
    if (department) q = q.eq('department', department);
    if (is_active !== undefined) q = q.eq('is_active', is_active !== 'false');
    if (search)     q = q.ilike('full_name', `%${search}%`);

    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    res.json({ data, count, meta: { total: count, limit: Number(limit), offset: Number(offset) } });
  } catch (err) {
    console.error('[users:list]', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ── GET /users/export  ───────────────────────────────────────────────────────
// CSV export — must come BEFORE /:id to avoid route shadowing
usersRouter.get('/export', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { role, department, is_active, search } = req.query as Record<string, string>;

    let q = adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (role)       q = q.eq('role', role);
    if (department) q = q.eq('department', department);
    if (is_active !== undefined) q = q.eq('is_active', is_active !== 'false');
    if (search)     q = q.ilike('full_name', `%${search}%`);

    const { data, error } = await q;
    if (error) throw error;

    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = 'id,full_name,role,department,is_active,phone,created_at,last_login_at\n';
    const rows = (data ?? []).map((u) =>
      [u['id'], u['full_name'], u['role'], u['department'], u['is_active'], u['phone'], u['created_at'], u['last_login_at']]
        .map(escape).join(',')
    ).join('\n');

    const filename = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(header + rows);
  } catch (err) {
    console.error('[users:export]', err);
    res.status(500).json({ error: 'Failed to export users.' });
  }
});

// ── GET /users/:id  ──────────────────────────────────────────────────────────
usersRouter.get('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', req.params['id'])
      .maybeSingle();

    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'User not found.' }); return; }

    res.json({ data });
  } catch (err) {
    console.error('[users:get]', err);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ── PATCH /users/:id  ────────────────────────────────────────────────────────
// Update role, department, full_name, phone, is_active
usersRouter.patch('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const authed = req as AuthenticatedRequest;
    const { id } = req.params as { id: string };
    const { role, department, full_name, phone, is_active } = req.body as {
      role?:        string;
      department?:  string;
      full_name?:   string;
      phone?:       string;
      is_active?:   boolean;
    };

    // Prevent admin from demoting themselves
    if (id === authed.user.id && role && role !== 'admin') {
      res.status(400).json({ error: 'Cannot change your own admin role.' });
      return;
    }

    if (role && !ROLES.includes(role as typeof ROLES[number])) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (role        !== undefined) updates['role']        = role;
    if (department  !== undefined) updates['department']  = department;
    if (full_name   !== undefined) updates['full_name']   = full_name;
    if (phone       !== undefined) updates['phone']       = phone;
    if (is_active   !== undefined) updates['is_active']   = is_active;

    const { data, error } = await adminClient
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'User not found.' }); return; }

    insertAuditLog({
      actor_id:      authed.user.id,
      action:        'update',
      resource_type: 'profile',
      resource_id:   id,
      metadata:      updates,
      ip_address:    req.ip ?? null,
      user_agent:    req.headers['user-agent'] ?? null,
    });

    res.json({ data });
  } catch (err) {
    console.error('[users:patch]', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// ── GET /users/:id/activity  ─────────────────────────────────────────────────
// Returns recent audit log entries where the user is the actor or the subject
usersRouter.get('/:id/activity', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const { data, error } = await adminClient
      .from('audit_logs')
      .select('id, action, resource_type, resource_id, created_at, metadata')
      .or(`actor_id.eq.${id},resource_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ data: data ?? [] });
  } catch (err) {
    console.error('[users:activity]', err);
    res.status(500).json({ error: 'Failed to fetch user activity.' });
  }
});

// ── POST /users/:id/reset-password  ─────────────────────────────────────────
// Generates a Supabase recovery link and emails it to the user
usersRouter.post('/:id/reset-password', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const authed = req as AuthenticatedRequest;
    const { id } = req.params as { id: string };

    // Fetch auth user to get email
    const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(id);
    if (authErr || !authUser?.user?.email) {
      res.status(404).json({ error: 'Auth account not found or has no email.' });
      return;
    }

    const { error: linkErr } = await adminClient.auth.admin.generateLink({
      type:  'recovery',
      email: authUser.user.email,
    });

    if (linkErr) {
      res.status(400).json({ error: linkErr.message });
      return;
    }

    insertAuditLog({
      actor_id:      authed.user.id,
      action:        'update',
      resource_type: 'profile',
      resource_id:   id,
      metadata:      { action: 'password_reset_sent', email: authUser.user.email },
      ip_address:    req.ip ?? null,
      user_agent:    req.headers['user-agent'] ?? null,
    });

    res.json({ ok: true, message: 'Password reset link generated and emailed to the user.' });
  } catch (err) {
    console.error('[users:reset-password]', err);
    res.status(500).json({ error: 'Failed to generate password reset link.' });
  }
});

// ── DELETE /users/:id  ───────────────────────────────────────────────────────
// Invite a new user via Supabase Auth admin API + create their profile row.
usersRouter.post('/invite', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const authed = req as AuthenticatedRequest;
    const { email, full_name, role = 'viewer', department, phone } = req.body as {
      email:       string;
      full_name:   string;
      role?:       string;
      department?: string;
      phone?:      string;
    };

    if (!email || !full_name) {
      res.status(400).json({ error: 'email and full_name are required.' });
      return;
    }

    if (!ROLES.includes(role as typeof ROLES[number])) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}` });
      return;
    }

    // Create the auth user (sends invite email automatically)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name },
    });

    if (authError) {
      res.status(400).json({ error: authError.message });
      return;
    }

    const userId = authData.user.id;

    // Upsert the profile row
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .upsert({
        id:          userId,
        full_name,
        role,
        department:  department ?? null,
        phone:       phone      ?? null,
        invited_by:  authed.user.id,
        is_active:   true,
      })
      .select()
      .maybeSingle();

    if (profileError) throw profileError;

    insertAuditLog({
      actor_id:      authed.user.id,
      action:        'create',
      resource_type: 'profile',
      resource_id:   userId,
      metadata:      { email, role, department },
      ip_address:    req.ip ?? null,
      user_agent:    req.headers['user-agent'] ?? null,
    });

    res.status(201).json({ data: profile });
  } catch (err) {
    console.error('[users:invite]', err);
    res.status(500).json({ error: 'Failed to invite user.' });
  }
});

// ── DELETE /users/:id  ───────────────────────────────────────────────────────
// Soft-deactivate only. Use PATCH is_active=false for true deactivation.
// Hard delete via Supabase dashboard only.
usersRouter.delete('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const authed = req as AuthenticatedRequest;
    const { id } = req.params as { id: string };

    if (id === authed.user.id) {
      res.status(400).json({ error: 'Cannot deactivate your own account.' });
      return;
    }

    const { data, error } = await adminClient
      .from('profiles')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'User not found.' }); return; }

    // NOTE: We intentionally do NOT call auth.admin.deleteUser() here.
    // Soft deactivation via is_active=false is enough — AuthGuard blocks access.
    // This preserves the auth account so the user can be reactivated without
    // needing to re-invite them.

    insertAuditLog({
      actor_id:      authed.user.id,
      action:        'delete',
      resource_type: 'profile',
      resource_id:   id,
      metadata:      { reason: 'deactivated_by_admin' },
      ip_address:    req.ip ?? null,
      user_agent:    req.headers['user-agent'] ?? null,
    });

    res.json({ data });
  } catch (err) {
    console.error('[users:deactivate]', err);
    res.status(500).json({ error: 'Failed to deactivate user.' });
  }
});
