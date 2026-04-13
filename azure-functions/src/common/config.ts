// azure-functions/src/common/config.ts
// Centralised, validated configuration for all Azure connector functions.
// All secrets come from environment variables — never hardcoded.

import type { HeqcisEnvironment } from './types.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[Config] Required environment variable "${key}" is missing or empty.`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  return (process.env[key] ?? '').trim() || defaultValue;
}

function optionalBoolEnv(key: string, defaultValue: boolean): boolean {
  const raw = (process.env[key] ?? '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function optionalIntEnv(key: string, defaultValue: number): number {
  const raw = (process.env[key] ?? '').trim();
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

// ─── Webhook config ───────────────────────────────────────────────────────────

export interface WebhookConfig {
  baseUrl: string;
  secret: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export function getWebhookConfig(): WebhookConfig {
  return {
    baseUrl:      requireEnv('WEBHOOK_BASE_URL').replace(/\/$/, ''),
    secret:       requireEnv('WEBHOOK_SECRET'),
    timeoutMs:    optionalIntEnv('WEBHOOK_TIMEOUT_MS', 10_000),
    maxRetries:   optionalIntEnv('WEBHOOK_MAX_RETRIES', 3),
    retryDelayMs: optionalIntEnv('WEBHOOK_RETRY_DELAY_MS', 2_000),
  };
}

// ─── SQL config ───────────────────────────────────────────────────────────────

export interface SqlConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  port: number;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
  backupQuery: string;
  etlQuery: string;
  etlJobName: string;
}

export function getSqlConfig(): SqlConfig {
  return {
    server:                 requireEnv('SQL_SERVER'),
    database:               requireEnv('SQL_DATABASE'),
    user:                   requireEnv('SQL_USER'),
    password:               requireEnv('SQL_PASSWORD'),
    port:                   optionalIntEnv('SQL_PORT', 1433),
    encrypt:                optionalBoolEnv('SQL_ENCRYPT', true),
    trustServerCertificate: optionalBoolEnv('SQL_TRUST_SERVER_CERT', false),
    connectTimeoutMs:       optionalIntEnv('SQL_CONNECT_TIMEOUT_MS', 15_000),
    requestTimeoutMs:       optionalIntEnv('SQL_REQUEST_TIMEOUT_MS', 30_000),
    backupQuery:            optionalEnv(
      'BACKUP_SQL_QUERY',
      `SELECT TOP 5
         database_name,
         backup_start_date,
         backup_finish_date,
         type,
         backup_size,
         is_damaged
       FROM msdb.dbo.backupset
       WHERE database_name = 'Heqcis_web'
       ORDER BY backup_start_date DESC`,
    ),
    etlQuery:     optionalEnv(
      'ETL_SQL_QUERY',
      `SELECT TOP 5
         j.job_id, j.name, j.enabled, j.date_created,
         h.run_date, h.run_time, h.run_status, h.message
       FROM msdb.dbo.sysjobs j
       LEFT JOIN msdb.dbo.sysjobhistory h
         ON h.job_id = j.job_id AND h.step_id = 0
       WHERE j.name = 'HEQCISWEB_Job'
       ORDER BY h.run_date DESC, h.run_time DESC`,
    ),
    etlJobName: optionalEnv('ETL_JOB_NAME', 'HEQCISWEB_Job'),
  };
}

// ─── General app config ───────────────────────────────────────────────────────

export interface AppConfig {
  environment: HeqcisEnvironment;
  useKeyVault: boolean;
  keyVaultUri: string | null;
}

export function getAppConfig(): AppConfig {
  const env = optionalEnv('HEQCIS_ENVIRONMENT', 'development') as HeqcisEnvironment;
  const validEnvs: HeqcisEnvironment[] = ['development', 'staging', 'production'];
  if (!validEnvs.includes(env)) {
    throw new Error(`[Config] HEQCIS_ENVIRONMENT must be one of: ${validEnvs.join(', ')}`);
  }
  const useKeyVault = optionalBoolEnv('USE_KEY_VAULT', false);
  const keyVaultUri = useKeyVault ? requireEnv('KEY_VAULT_URI') : null;

  return { environment: env, useKeyVault, keyVaultUri };
}
