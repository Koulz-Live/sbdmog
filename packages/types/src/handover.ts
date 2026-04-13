// packages/types/src/handover.ts

export type HandoverCategory = 'knowledge' | 'access' | 'documentation' | 'process' | 'system';
export type HandoverStatus   = 'pending' | 'in_progress' | 'completed';

export interface HandoverItem {
  id: string;
  category: HandoverCategory;
  title: string;
  description: string | null;
  status: HandoverStatus;
  owner_id: string | null;
  target_date: string | null;
  completed_at: string | null;
  evidence_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
