// packages/types/src/backup.ts

export type BackupSource = 'webhook' | 'manual';
export type BackupType   = 'full' | 'differential' | 'log';
export type BackupStatus = 'success' | 'failed' | 'running' | 'cancelled';

export interface BackupRun {
  id: string;
  source: BackupSource;
  database_name: string;
  backup_type: BackupType;
  status: BackupStatus;
  started_at: string | null;
  finished_at: string | null;
  size_bytes: number | null;
  disk_free_bytes_before: number | null;
  disk_free_bytes_after: number | null;
  backup_path: string | null;
  error_message: string | null;
  remediation_note: string | null;
  created_at: string;
  updated_at: string;
}
