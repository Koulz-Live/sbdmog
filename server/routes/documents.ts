// api/routes/documents.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { generateDocumentationDraft } from '@heqcis/ai';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const documentsRouter = Router();

const createSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(200),
  doc_type: z.enum(['runbook','procedure','policy','architecture','handover']),
  content: z.string().max(100_000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  version: z.string().default('1.0'),
  storage_path: z.string().max(1000).optional().nullable(),
});

documentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { doc_type, limit = '50', offset = '0' } = req.query as Record<string, string>;
    let q = adminClient.from('documents').select('*', { count: 'exact' }).order('updated_at', { ascending: false });
    if (doc_type) q = q.eq('doc_type', doc_type);
    q = q.range(Number(offset), Number(offset) + Number(limit) - 1);
    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data, meta: { total: count } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

documentsRouter.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { data, error } = await adminClient.from('documents').select('*').eq('slug', req.params['slug']!).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Document not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document.' });
  }
});

documentsRouter.post('/', requirePermission('create', 'documents'), validateBody(createSchema), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('documents').insert({ ...req.body, author_id: authed.user.id, last_updated_by: authed.user.id }).select().single();
    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create document.' });
  }
});

documentsRouter.patch('/:id', requirePermission('update', 'documents'), validateBody(createSchema.partial()), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const { data, error } = await adminClient.from('documents').update({ ...req.body, last_updated_by: authed.user.id }).eq('id', req.params['id']!).select().single();
    if (error) throw error;
    if (!data) { res.status(404).json({ error: 'Document not found.' }); return; }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update document.' });
  }
});

documentsRouter.delete('/:id', requirePermission('delete', 'documents'), async (req: Request, res: Response) => {
  try {
    const { error } = await adminClient.from('documents').delete().eq('id', req.params['id']!);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

documentsRouter.post('/ai/draft', requirePermission('create', 'documents'), async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  const { doc_type, title, context } = req.body as { doc_type: string; title: string; context: string };
  if (!doc_type || !title || !context) {
    res.status(400).json({ error: 'doc_type, title, and context are required.' });
    return;
  }
  try {
    const result = await generateDocumentationDraft(doc_type, title, context);
    await adminClient.from('ai_generations').insert({ resource_type: 'documents', prompt_type: 'documentation_assist', prompt_tokens: result.prompt_tokens, completion_tokens: result.completion_tokens, model: result.model, output: result.output, created_by: authed.user.id });
    res.json({ data: { output: result.output, model: result.model } });
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
