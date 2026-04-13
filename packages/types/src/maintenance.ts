// packages/types/src/maintenance.ts

export type ActivityType   = 'scheduled' | 'emergency' | 'patch' | 'upgrade' | 'audit';
export type ActivityStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceActivity {
  id: string;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  status: ActivityStatus;
  system_target: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
