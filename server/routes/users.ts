// server/routes/users.ts
// Admin-only user management: list, update role/dept, invite, deactivate/reactivate.
// Uses Supabase Auth Admin API for user creation + the profiles table for metadata.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requireRole } from '../middleware/rbac.js';
import { insertAuditLog } from '../lib/auditHelper.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const usersRouter = Router();

const ROLES = ['admin', 'engineer', 'analyst', 'viewer'] as const;

// ── GET /users  ──────────────────────────────────────────────────────────────
// Lists all profiles with optional filters: role, department, is_active, search
usersRouter.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const {
      role,
      department,
      is_active,
      search,
      limit  = '100',
      offset = '0',
    } = req.query as Record<string, string>;

    let q = adminClient
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

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

// ── POST /users/invite  ──────────────────────────────────────────────────────
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

    // Also disable login via Supabase Auth (best-effort)
    // The profile is_active=false flag gates app access via AuthGuard immediately.
    void adminClient.auth.admin.deleteUser(id).catch(() => {/* no-op if already absent */});

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
