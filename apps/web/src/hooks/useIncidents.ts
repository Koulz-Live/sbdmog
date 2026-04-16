// apps/web/src/hooks/useIncidents.ts
// React Query hooks for the incidents API endpoints.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch } from '../services/api.js';
import type { Incident, IncidentUpdate } from '@heqcis/types';

// ── Types matching API responses ────────────────────────────────────────────

interface IncidentListParams {
  status?:   string;
  severity?: string;
  limit?:    number;
  offset?:   number;
}

interface IncidentListResponse {
  data:  Incident[];
  count: number;
}

interface IncidentUpdatesResponse {
  data: IncidentUpdate[];
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useIncidents(params: IncidentListParams = {}) {
  const qs = new URLSearchParams();
  if (params.status)   qs.set('status',   params.status);
  if (params.severity) qs.set('severity', params.severity);
  if (params.limit)    qs.set('limit',    String(params.limit));
  if (params.offset)   qs.set('offset',   String(params.offset));

  const query = qs.toString();

  return useQuery({
    queryKey: ['incidents', params],
    queryFn:  () => apiGet<IncidentListResponse>(`/incidents${query ? `?${query}` : ''}`),
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incidents', id],
    queryFn:  async () => {
      const res = await apiGet<{ data: Incident & { updates: IncidentUpdate[] } }>(`/incidents/${id}`);
      return res.data;
    },
    enabled:  Boolean(id),
  });
}

export function useIncidentUpdates(incidentId: string) {
  return useQuery({
    queryKey: ['incidentUpdates', incidentId],
    queryFn:  () => apiGet<IncidentUpdatesResponse>(`/incidents/${incidentId}/updates`),
    enabled:  Boolean(incidentId),
  });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Incident>) => apiPost<Incident>('/incidents', body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });
}

export function useUpdateIncident(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Incident>) => apiPatch<Incident>(`/incidents/${id}`, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['incidents', id] });
    },
  });
}

export function useAddIncidentUpdate(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { content: string }) =>
      apiPost<IncidentUpdate>(`/incidents/${incidentId}/updates`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidentUpdates', incidentId] }),
  });
}

export function useGenerateAiSummary(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ ai_summary: string }>(`/incidents/${incidentId}/ai/summary`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['incidents', incidentId] }),
  });
}

export function useGenerateRca(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ ai_rca_draft: string }>(`/incidents/${incidentId}/ai/rca`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['incidents', incidentId] }),
  });
}
