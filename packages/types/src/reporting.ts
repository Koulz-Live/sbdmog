// packages/types/src/reporting.ts

export type ReportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ReportStatus   = 'submitted' | 'in_progress' | 'delivered' | 'closed';

export interface ReportRequest {
  id: string;
  title: string;
  description: string | null;
  requester_id: string | null;
  assigned_to: string | null;
  priority: ReportPriority;
  status: ReportStatus;
  due_date: string | null;
  delivery_url: string | null;
  created_at: string;
  updated_at: string;
}
