// packages/types/src/submission.ts

export type SubmissionType = 'SAQA_NLRD' | 'DHET_STATS' | 'HEQF_MAPPING' | 'OTHER';
export type SubmissionStatus = 'pending' | 'in_progress' | 'ready' | 'blocked';

export type ValidationIssueType = 'missing_field' | 'format_error' | 'out_of_range' | 'duplicate' | 'other';

export interface SubmissionReadinessCheck {
  id: string;
  submission_type: SubmissionType;
  period: string;
  overall_status: SubmissionStatus;
  checked_by: string | null;
  notes: string | null;
  checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionValidationIssue {
  id: string;
  check_id: string;
  field_name: string | null;
  issue_type: ValidationIssueType;
  description: string;
  resolved: boolean;
  created_at: string;
}
