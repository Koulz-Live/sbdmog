// api/routes/incidents.ts
// Full CRUD for incidents + updates + AI summarise/RCA endpoints.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { adminClient } from '@heqcis/supabase';
import { listIncidents, getIncidentById, listIncidentUpdates } from '@heqcis/supabase';
import {
  createIncidentSchema,
  updateIncidentSchema,
  createIncidentUpdateSchema,
  generateIncidentReference,
} from '@heqcis/core';
import { generateIncidentSummary, generateRcaDraft } from '@heqcis/ai';
import { validateBody } from '../middleware/validate.js';
import { requirePermission } from '../middleware/rbac.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import type { AuditMeta } from '../middleware/audit.js';

export const incidentsRouter = Router();

// ── List ─────────────────────────────────────────────────────────────────────
incidentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, severity, limit = '25', offset = '0' } = req.query as Record<string, string>;
    const { data, count } = await listIncidents(adminClient, {
      status,
      severity,
      limit:  Number(limit),
      offset: Number(offset),
    });
    res.json({ data, meta: { total: count } });
  } catch (err) {
    console.error('[incidents:list]', err);
    res.status(500).json({ error: 'Failed to fetch incidents.' });
  }
});

// ── Get by ID ─────────────────────────────────────────────────────────────────
incidentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const incident = await getIncidentById(adminClient, req.params['id']!);
    if (!incident) { res.status(404).json({ error: 'Incident not found.' }); return; }
    const updates = await listIncidentUpdates(adminClient, incident.id);
    res.json({ data: { ...incident, updates } });
  } catch (err) {
    console.error('[incidents:get]', err);
    res.status(500).json({ error: 'Failed to fetch incident.' });
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
incidentsRouter.post(
  '/',
  requirePermission('create', 'incidents'),
  validateBody(createIncidentSchema),
  async (req: Request, res: Response) => {
    const authed = req as AuthenticatedRequest;
    try {
      // Generate next reference
      const { count } = await adminClient.from('incidents').select('id', { count: 'exact', head: true });
      const reference = generateIncidentReference((count ?? 0) + 1);

      const { data, error } = await adminClient
        .from('incidents')
        .insert({ ...req.body, reference, reported_by: authed.user.id })
        .select()
        .single();

      if (error) throw error;

      authed.auditMeta = { action: 'create', resource_type: 'incidents', resource_id: data.id } satisfies AuditMeta;
      res.status(201).json({ data });
    } catch (err) {
      console.error('[incidents:create]', err);
      res.status(500).json({ error: 'Failed to create incident.' });
    }
  },
);

// ── Update ────────────────────────────────────────────────────────────────────
incidentsRouter.patch(
  '/:id',
  requirePermission('update', 'incidents'),
  validateBody(updateIncidentSchema),
  async (req: Request, res: Response) => {
    const authed = req as AuthenticatedRequest;
    try {
      const { data, error } = await adminClient
        .from('incidents')
        .update(req.body)
        .eq('id', req.params['id']!)
        .select()
        .single();

      if (error) throw error;
      if (!data) { res.status(404).json({ error: 'Incident not found.' }); return; }

      authed.auditMeta = { action: 'update', resource_type: 'incidents', resource_id: data.id } satisfies AuditMeta;
      res.json({ data });
    } catch (err) {
      console.error('[incidents:update]', err);
      res.status(500).json({ error: 'Failed to update incident.' });
    }
  },
);

// ── Add Update ────────────────────────────────────────────────────────────────
incidentsRouter.post(
  '/:id/updates',
  requirePermission('create', 'incident_updates'),
  validateBody(createIncidentUpdateSchema),
  async (req: Request, res: Response) => {
    const authed = req as AuthenticatedRequest;
    try {
      const { data, error } = await adminClient
        .from('incident_updates')
        .insert({ incident_id: req.params['id']!, author_id: authed.user.id, content: req.body.content })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ data });
    } catch (err) {
      console.error('[incidents:addUpdate]', err);
      res.status(500).json({ error: 'Failed to add incident update.' });
    }
  },
);

// ── AI: Summary ───────────────────────────────────────────────────────────────
incidentsRouter.post('/:id/ai/summary', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const incident = await getIncidentById(adminClient, req.params['id']!);
    if (!incident) { res.status(404).json({ error: 'Incident not found.' }); return; }

    const result = await generateIncidentSummary(incident);

    // Persist AI generation record
    await adminClient.from('ai_generations').insert({
      resource_type:     'incidents',
      resource_id:       incident.id,
      prompt_type:       'incident_summary',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    // Patch the incident with the generated summary
    await adminClient.from('incidents').update({ ai_summary: result.output }).eq('id', incident.id);

    res.json({ data: { output: result.output, model: result.model } });
  } catch (err) {
    console.error('[incidents:ai:summary]', err);
    res.status(500).json({ error: 'AI generation failed.' });
  }
});

// ── AI: RCA Draft ─────────────────────────────────────────────────────────────
incidentsRouter.post('/:id/ai/rca', async (req: Request, res: Response) => {
  const authed = req as AuthenticatedRequest;
  try {
    const incident = await getIncidentById(adminClient, req.params['id']!);
    if (!incident) { res.status(404).json({ error: 'Incident not found.' }); return; }

    const result = await generateRcaDraft(incident);

    await adminClient.from('ai_generations').insert({
      resource_type:     'incidents',
      resource_id:       incident.id,
      prompt_type:       'rca_draft',
      prompt_tokens:     result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      model:             result.model,
      output:            result.output,
      created_by:        authed.user.id,
    });

    await adminClient.from('incidents').update({ ai_rca_draft: result.output }).eq('id', incident.id);

    res.json({ data: { output: result.output, model: result.model } });
  } catch (err) {
    console.error('[incidents:ai:rca]', err);
    res.status(500).json({ error: 'AI generation failed.' });
  }
});
