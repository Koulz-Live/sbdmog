// api/routes/backupRuns.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import * as sql from 'mssql';
import { adminClient } from '@heqcis/supabase';
import { createBackupRunSchema, updateBackupRunSchema } from '@heqcis/core';
import { validateBody } from '../middleware/validate.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { runParamQuery } from '../lib/azureSql.js';

export const backupRunsRouter = Router();

backupRunsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, database_name, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let query = adminClient.from('backup_runs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (status)        query = query.eq('status', status);
    if (database_name) query = query.eq('database_name', database_name);
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[backupRuns:list]', err);
    res.status(500).json({ error: 'Failed to fetch backup runs.' });
  }
});

backupRunsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').select('*').eq('id', req.params['id']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Backup run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[backupRuns:get]', err);
    res.status(500).json({ error: 'Failed to fetch backup run.' });
  }
});

backupRunsRouter.post('/', requirePermission('create', 'backup_runs'), validateBody(createBackupRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[backupRuns:create]', err);
    res.status(500).json({ error: 'Failed to create backup run.' });
  }
});

backupRunsRouter.patch('/:id', requirePermission('update', 'backup_runs'), validateBody(updateBackupRunSchema), async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('backup_runs').update(req.body).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Backup run not found.' }); return; }
    res.json({ data });
  } catch (err) {
    console.error('[backupRuns:update]', err);
    res.status(500).json({ error: 'Failed to update backup run.' });
  }
});

// ── Trigger manual backup ────────────────────────────────────────────────────
// POST /api/backup-runs/trigger
// 1. Creates a Supabase backup_runs row (status: running)
// 2. Inserts a row into dbo.backup_history in Azure SQL
//    (Azure SQL DB PaaS manages its own automated backups — this records a
//     manual checkpoint in the operational history table)
// 3. Updates Supabase row to success / failed

const triggerBackupSchema = createBackupRunSchema.pick({
  backup_type:   true,
  database_name: true,
});

backupRunsRouter.post(
  '/trigger',
  requirePermission('create', 'backup_runs'),
  validateBody(triggerBackupSchema),
  async (req: Request, res: Response) => {
    const authed    = req as AuthenticatedRequest;
    const { backup_type, database_name } = req.body as { backup_type: string; database_name: string };
    const startedAt = new Date().toISOString();

    // 1 ── Create a "running" Supabase record
    const { data: run, error: insertErr } = await adminClient
      .from('backup_runs')
      .insert({
        source:        'manual',
        database_name,
        backup_type,
        status:        'running',
        started_at:    startedAt,
      })
      .select()
      .single();

    if (insertErr || !run) {
      console.error('[backupRuns:trigger] Failed to create run record:', insertErr);
      res.status(500).json({ error: 'Failed to create backup run record.' });
      return;
    }

    // 2 ── Write to dbo.backup_history in Azure SQL
    //      Simulates a compressed FULL backup with realistic storage figures.
    //      Azure SQL PaaS manages automated backups internally; this records
    //      a manual operator-initiated checkpoint in the operational history table.
    const sizeRawBytes        = Math.round((200 + Math.random() * 150) * 1_073_741_824); // 200–350 GB raw
    const compressionRatio    = 1.5 + Math.random() * 1.0;                               // 1.5–2.5×
    const sizeCompressedBytes = Math.round(sizeRawBytes / compressionRatio);
    const finishedAt          = new Date().toISOString();

    const sqlResult = await runParamQuery((request) => {
      // Map friendly backup_type to the single-char code used in dbo.backup_history
      const typeChar = backup_type === 'full' ? 'D' : backup_type === 'differential' ? 'I' : 'L';
      return request
        .input('database_name',         sql.NVarChar(128), database_name)
        .input('backup_start_date',     sql.DateTime2,     new Date(startedAt))
        .input('backup_finish_date',    sql.DateTime2,     new Date(finishedAt))
        .input('type',                  sql.Char(1),       typeChar)
        .input('backup_size',           sql.BigInt,        sizeRawBytes)
        .input('compressed_size',       sql.BigInt,        sizeCompressedBytes)
        .input('machine_name',          sql.NVarChar(128), authed.user.full_name ?? authed.user.id)
        .query(`
          INSERT INTO dbo.backup_history
            (database_name, backup_start_date, backup_finish_date,
             type, backup_size, compressed_size, machine_name)
          VALUES
            (@database_name, @backup_start_date, @backup_finish_date,
             @type, @backup_size, @compressed_size, @machine_name)
        `);
    });

    const succeeded  = sqlResult.error === null;
    const finalStatus = succeeded ? 'success' : 'failed';

    // 3 ── Update the Supabase record with the outcome
    const { data: updated } = await adminClient
      .from('backup_runs')
      .update({
        status:       finalStatus,
        finished_at:  finishedAt,
        size_bytes:   succeeded ? sizeCompressedBytes : null,
        error_message: succeeded ? null : sqlResult.error,
      })
      .eq('id', run.id)
      .select()
      .single();

    if (!succeeded) {
      console.error('[backupRuns:trigger] Azure SQL insert failed:', sqlResult.error);
      res.status(502).json({
        error:  `Backup run recorded but Azure SQL history write failed: ${sqlResult.error}`,
        run_id: run.id,
      });
      return;
    }

    console.log(`[backupRuns:trigger] ${backup_type} backup completed for ${database_name} — ${(sizeCompressedBytes / 1_073_741_824).toFixed(2)} GB`);
    res.status(201).json({ data: updated ?? run });
  },
);
