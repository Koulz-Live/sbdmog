// packages/supabase/src/queries/dashboard.ts
// Aggregated queries powering the ops dashboard summary cards.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DashboardSummary {
  open_incidents: number;
  p1_p2_incidents: number;
  failed_backups_24h: number;
  failed_etl_24h: number;
  open_security_findings: number;
  critical_security_findings: number;
  pending_change_requests: number;
  open_popia_events: number;
}

export async function getDashboardSummary(
  client: SupabaseClient,
): Promise<DashboardSummary> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();

  const [
    openIncidents,
    p1p2Incidents,
    failedBackups,
    failedEtl,
    openSecurity,
    criticalSecurity,
    pendingCRs,
    openPopia,
  ] = await Promise.all([
    client.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    client.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']).in('severity', ['P1', 'P2']),
    client.from('backup_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', yesterday),
    client.from('etl_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', yesterday),
    client.from('security_findings').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_remediation']),
    client.from('security_findings').select('id', { count: 'exact', head: true }).eq('severity', 'critical').in('status', ['open', 'in_remediation']),
    client.from('change_requests').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']),
    client.from('popia_events').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
  ]);

  return {
    open_incidents:            openIncidents.count  ?? 0,
    p1_p2_incidents:           p1p2Incidents.count  ?? 0,
    failed_backups_24h:        failedBackups.count  ?? 0,
    failed_etl_24h:            failedEtl.count      ?? 0,
    open_security_findings:    openSecurity.count   ?? 0,
    critical_security_findings: criticalSecurity.count ?? 0,
    pending_change_requests:   pendingCRs.count     ?? 0,
    open_popia_events:         openPopia.count      ?? 0,
  };
}
