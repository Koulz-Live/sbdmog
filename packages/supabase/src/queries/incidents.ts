// packages/supabase/src/queries/incidents.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Incident, IncidentUpdate } from '@heqcis/types';

export async function listIncidents(
  client: SupabaseClient,
  params: {
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ data: Incident[]; count: number | null }> {
  let query = client
    .from('incidents')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params.status)   query = query.eq('status', params.status);
  if (params.severity) query = query.eq('severity', params.severity);
  if (params.limit)    query = query.limit(params.limit);
  if (params.offset)   query = query.range(params.offset, params.offset + (params.limit ?? 25) - 1);

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: (data ?? []) as Incident[], count };
}

export async function getIncidentById(
  client: SupabaseClient,
  id: string,
): Promise<Incident | null> {
  const { data, error } = await client
    .from('incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Incident | null;
}

export async function listIncidentUpdates(
  client: SupabaseClient,
  incidentId: string,
): Promise<IncidentUpdate[]> {
  const { data, error } = await client
    .from('incident_updates')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IncidentUpdate[];
}
