// packages/types/src/security.ts

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type SecurityStatus   = 'open' | 'in_remediation' | 'remediated' | 'accepted' | 'false_positive';
export type SecuritySource   = 'scan' | 'audit' | 'manual' | 'siem';

export interface SecurityFinding {
  id: string;
  title: string;
  description: string | null;
  severity: SecuritySeverity;
  status: SecurityStatus;
  source: SecuritySource;
  affected_system: string | null;
  assigned_to: string | null;
  ai_remediation_guidance: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}
