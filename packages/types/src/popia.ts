// packages/types/src/popia.ts

export type PopiaEventType = 'breach' | 'request' | 'consent' | 'deletion' | 'audit';
export type PopiaStatus    = 'open' | 'under_review' | 'resolved' | 'closed';

export interface PopiaEvent {
  id: string;
  event_type: PopiaEventType;
  description: string;
  data_subject: string | null;
  reported_by: string | null;
  status: PopiaStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}
