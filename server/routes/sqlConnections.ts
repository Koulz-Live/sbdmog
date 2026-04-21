// server/routes/sqlConnections.ts
// CRUD API for SQL Server connection profiles.
// GET    /api/sql-connections          — list all active connections (auth users)
// GET    /api/sql-connections/:id      — get single connection (auth users)
// POST   /api/sql-connections          — create connection (admin only)
// PATCH  /api/sql-connections/:id      — update connection (admin only)
// DELETE /api/sql-connections/:id      — soft-delete / deactivate (admin only)
// POST   /api/sql-connections/:id/test — test connectivity (admin only)

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { buildPoolFromRecord } from '../lib/sqlPool.js';

export const sqlConnectionsRouter = Router();

// ── Helper: assert admin ───────────────────────────────────────────────────────
function assertAdmin(req: Request, res: Response): boolean {
  const role = (req as Request & { userRole?: string }).userRole;
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return false;
  }
  return true;
}

// ── GET /api/sql-connections ──────────────────────────────────────────────────
sqlConnectionsRouter.get('/', async (req: Request, res: Response) => {
  const includeInactive = (req.query['include_inactive'] as string) === 'true';

  let query = adminClient
    .from('sql_connections')
    .select(
      'id, label, description, connection_type, server, port, database_name, ' +
      'auth_type, username, secret_ref, encrypt, trust_server_certificate, ' +
      'connect_timeout_ms, request_timeout_ms, is_default, is_active, ' +
      'last_tested_at, last_test_status, last_test_message, created_at, updated_at',
    )
    .order('connection_type')
    .order('label');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ connections: data });
});

// ── GET /api/sql-connections/:id ──────────────────────────────────────────────
sqlConnectionsRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const { data, error } = await adminClient
    .from('sql_connections')
    .select(
      'id, label, description, connection_type, server, port, database_name, ' +
      'auth_type, username, secret_ref, encrypt, trust_server_certificate, ' +
      'connect_timeout_ms, request_timeout_ms, is_default, is_active, ' +
      'last_tested_at, last_test_status, last_test_message, created_at, updated_at',
    )
    .eq('id', id)
    .single();

  if (error) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  res.json(data);
});

// ── POST /api/sql-connections ─────────────────────────────────────────────────
sqlConnectionsRouter.post('/', async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;

  const userId = (req as Request & { userId?: string }).userId;

  const {
    label, description, connection_type, server, port, database_name,
    auth_type, username, secret_ref, encrypt, trust_server_certificate,
    connect_timeout_ms, request_timeout_ms, is_default,
  } = req.body as Record<string, unknown>;

  // Basic validation
  if (!label || !connection_type || !server || !database_name) {
    res.status(400).json({ error: 'label, connection_type, server, and database_name are required.' });
    return;
  }

  if (!['azure_sql', 'windows_sql'].includes(connection_type as string)) {
    res.status(400).json({ error: 'connection_type must be azure_sql or windows_sql.' });
    return;
  }

  // If setting as default, clear existing default for this type
  if (is_default) {
    await adminClient
      .from('sql_connections')
      .update({ is_default: false })
      .eq('connection_type', connection_type)
      .eq('is_default', true);
  }

  const { data, error } = await adminClient
    .from('sql_connections')
    .insert({
      label,
      description:              description ?? null,
      connection_type,
      server,
      port:                     port ?? 1433,
      database_name,
      auth_type:                auth_type ?? 'sql_auth',
      username:                 username ?? null,
      secret_ref:               secret_ref ?? null,
      encrypt:                  encrypt ?? true,
      trust_server_certificate: trust_server_certificate ?? false,
      connect_timeout_ms:       connect_timeout_ms ?? 15000,
      request_timeout_ms:       request_timeout_ms ?? 30000,
      is_default:               is_default ?? false,
      is_active:                true,
      created_by:               userId,
      updated_by:               userId,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

// ── PATCH /api/sql-connections/:id ────────────────────────────────────────────
sqlConnectionsRouter.patch('/:id', async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;

  const { id } = req.params as { id: string };
  const userId = (req as Request & { userId?: string }).userId;

  const allowedFields = [
    'label', 'description', 'connection_type', 'server', 'port', 'database_name',
    'auth_type', 'username', 'secret_ref', 'encrypt', 'trust_server_certificate',
    'connect_timeout_ms', 'request_timeout_ms', 'is_default', 'is_active',
  ];

  const updates: Record<string, unknown> = { updated_by: userId };
  for (const field of allowedFields) {
    if (field in req.body) updates[field] = req.body[field];
  }

  // If setting as default, clear existing default for this type
  if (updates['is_default'] === true && updates['connection_type']) {
    await adminClient
      .from('sql_connections')
      .update({ is_default: false })
      .eq('connection_type', updates['connection_type'] as string)
      .eq('is_default', true)
      .neq('id', id);
  }

  const { data, error } = await adminClient
    .from('sql_connections')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

// ── DELETE /api/sql-connections/:id ───────────────────────────────────────────
sqlConnectionsRouter.delete('/:id', async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;

  const { id } = req.params as { id: string };
  const userId = (req as Request & { userId?: string }).userId;

  // Soft-delete by deactivating
  const { error } = await adminClient
    .from('sql_connections')
    .update({ is_active: false, updated_by: userId })
    .eq('id', id);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ success: true, message: 'Connection deactivated.' });
});

// ── POST /api/sql-connections/:id/test ────────────────────────────────────────
sqlConnectionsRouter.post('/:id/test', async (req: Request, res: Response) => {
  if (!assertAdmin(req, res)) return;

  const { id } = req.params as { id: string };

  // Fetch the connection record (including secret_ref)
  const { data: conn, error: fetchErr } = await adminClient
    .from('sql_connections')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !conn) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }

  const started = Date.now();
  let testStatus: 'success' | 'failed' = 'failed';
  let testMessage = '';

  try {
    const pool = await buildPoolFromRecord(conn);
    // Simple connectivity query
    await pool.request().query('SELECT 1 AS ping');
    await pool.close();
    testStatus  = 'success';
    testMessage = `Connected in ${Date.now() - started}ms`;
  } catch (err: unknown) {
    testMessage = err instanceof Error ? err.message : String(err);
  }

  // Persist test result
  await adminClient
    .from('sql_connections')
    .update({
      last_tested_at:    new Date().toISOString(),
      last_test_status:  testStatus,
      last_test_message: testMessage,
    })
    .eq('id', id);

  res.json({
    status:     testStatus,
    message:    testMessage,
    elapsed_ms: Date.now() - started,
  });
});
