// packages/types/src/etl.ts

export type EtlSource = 'webhook' | 'manual';
export type EtlStatus = 'success' | 'failed' | 'running' | 'cancelled';

export interface EtlRun {
  id: string;
  source: EtlSource;
  job_name: string;
  pipeline_name: string | null;
  status: EtlStatus;
  rows_processed: number | null;
  rows_failed: number | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  restart_required: boolean;
  restart_completed_at: string | null;
  created_at: string;
  updated_at: string;
}
