// packages/types/src/incident.ts

export type IncidentCategory =
  | 'system_outage'
  | 'performance_degradation'
  | 'data_quality'
  | 'security_event'
  | 'integration_failure'
  | 'other';

export type IncidentAffectedSystem =
  | 'HEQCIS'
  | 'NLRD'
  | 'SAQA'
  | 'DHET'
  | 'ETL_Pipeline'
  | 'Backup_System'
  | 'Reporting'
  | 'Auth'
  | 'Other';

export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';

export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  category: IncidentCategory;
  affected_system: IncidentAffectedSystem;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assigned_to: string | null;
  reported_by: string | null;
  sla_breach_at: string | null;
  ai_summary: string | null;
  ai_rca_draft: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
}
