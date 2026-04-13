// azure-functions/src/common/types.ts
// Shared TypeScript interfaces for all HEQCIS Azure connector payloads.

// ─── Connector identity ───────────────────────────────────────────────────────

export type ConnectorSource = 'azure-sql-connector' | 'azure-backup-connector' | 'azure-etl-connector';

export type HeqcisEnvironment = 'development' | 'staging' | 'production';

// ─── Base webhook envelope ────────────────────────────────────────────────────

export interface WebhookEnvelope<T> {
  /** Which Azure connector sent this payload */
  source: ConnectorSource;
  /** Human-readable name of the scheduled job */
  job_name: string;
  /** Environment tag — dev / staging / production */
  environment: HeqcisEnvironment;
  /** ISO-8601 UTC timestamp of when the payload was generated */
  timestamp: string;
  /** Payload schema version — increment on breaking changes */
  payload_version: '1.0';
  /** The connector-specific result data */
  data: T;
}

// ─── SQL check types ──────────────────────────────────────────────────────────

export type SqlCheckStatus = 'healthy' | 'degraded' | 'failed' | 'unknown';

export interface SqlCheckResult {
  /** Overall connection + query health */
  status: SqlCheckStatus;
  /** How long the check took in milliseconds */
  duration_ms: number;
  /** ISO timestamp of check execution */
  checked_at: string;
  /** Optional detail from the diagnostic query */
  details: SqlCheckDetail[];
  /** Any error message if the check failed */
  error_message: string | null;
}

export interface SqlCheckDetail {
  check_name: string;
  value: string | number | boolean | null;
  unit: string | null;
  is_healthy: boolean;
  message: string | null;
}

export type SqlCheckWebhookPayload = WebhookEnvelope<SqlCheckResult>;

// ─── Backup check types ───────────────────────────────────────────────────────

export type BackupCheckStatus = 'success' | 'warning' | 'failed' | 'unknown';

export interface BackupCheckResult {
  /** Overall backup health summary */
  status: BackupCheckStatus;
  /** Database name inspected */
  database_name: string;
  /** ISO timestamp of the most recently completed backup */
  last_backup_at: string | null;
  /** ISO timestamp of the most recent backup failure, if any */
  last_failure_at: string | null;
  /** Backup type of the last run: full / differential / log */
  last_backup_type: 'full' | 'differential' | 'log' | null;
  /** Size in bytes of the last backup */
  last_backup_size_bytes: number | null;
  /** Duration in seconds of the last backup */
  last_backup_duration_seconds: number | null;
  /** Whether the NOINIT risk pattern was detected */
  noinit_risk_detected: boolean;
  /** Disk free space at backup destination (bytes), if observable */
  disk_free_bytes: number | null;
  /** Error message from the last failure if applicable */
  error_message: string | null;
  /** Operator note for remediation — populated by connector if known */
  remediation_note: string | null;
  /** ISO timestamp of when this check ran */
  checked_at: string;
}

export type BackupWebhookPayload = WebhookEnvelope<BackupCheckResult>;

// ─── ETL check types ──────────────────────────────────────────────────────────

export type EtlCheckStatus = 'running' | 'idle' | 'failed' | 'stale' | 'unknown';

export interface EtlCheckResult {
  /** Overall ETL job status */
  status: EtlCheckStatus;
  /** ETL job name (e.g. HEQCISWEB_Job) */
  job_name: string;
  /** ISO timestamp of the last successful run */
  last_success_at: string | null;
  /** ISO timestamp of the last failure, if any */
  last_failure_at: string | null;
  /** Whether the job requires manual restart */
  restart_required: boolean;
  /** Approximate rows in pending backlog, if observable */
  backlog_rows: number | null;
  /** Number of rows processed in the last run */
  rows_processed: number | null;
  /** Number of rows that failed in the last run */
  rows_failed: number | null;
  /** Any failure reason or error message */
  failure_reason: string | null;
  /** Free-text notes from the connector */
  notes: string | null;
  /** ISO timestamp of when this check ran */
  checked_at: string;
}

export type EtlWebhookPayload = WebhookEnvelope<EtlCheckResult>;

// ─── Webhook delivery types ───────────────────────────────────────────────────

export interface WebhookDeliveryResult {
  success: boolean;
  status_code: number | null;
  attempt: number;
  duration_ms: number;
  error: string | null;
}
