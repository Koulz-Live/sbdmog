// packages/types/src/changeRequest.ts

export type CRType   = 'standard' | 'emergency' | 'normal';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type CRStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'implemented'
  | 'closed';
export type ApprovalDecision = 'approved' | 'rejected' | 'abstained';

export interface ChangeRequest {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  type: CRType;
  risk_level: RiskLevel | null;
  status: CRStatus;
  requested_by: string | null;
  scheduled_date: string | null;
  implemented_at: string | null;
  rollback_plan: string | null;
  testing_notes: string | null;
  ai_risk_assessment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequestApproval {
  id: string;
  change_request_id: string;
  approver_id: string | null;
  decision: ApprovalDecision;
  comments: string | null;
  decided_at: string | null;
  created_at: string;
}
