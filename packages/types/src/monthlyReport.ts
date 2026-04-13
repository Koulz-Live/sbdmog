// packages/types/src/monthlyReport.ts

export type MonthlyReportStatus = 'draft' | 'in_review' | 'approved' | 'published';

export interface MonthlyReport {
  id: string;
  period: string;
  status: MonthlyReportStatus;
  section_executive_summary: string | null;
  section_incidents: string | null;
  section_backup_etl: string | null;
  section_change_requests: string | null;
  section_security_popia: string | null;
  section_submission_readiness: string | null;
  section_upcoming_work: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
