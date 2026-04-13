// azure-functions/src/lib/sqlClient.ts
// Read-only SQL Server client for HEQCIS health checks.
//
// LEAST PRIVILEGE NOTE:
//   The SQL_USER account must have ONLY:
//     - CONNECT permission on Heqcis_web
//     - SELECT permission on target tables
//     - VIEW SERVER STATE (for basic health queries)
//     - READ access to msdb.dbo.backupset (for backup checks)
//     - READ access to msdb.dbo.sysjobs / sysjobhistory (for ETL checks)
//   It must NOT have: INSERT, UPDATE, DELETE, EXECUTE, db_owner, sysadmin
//
//   Provision with:
//     CREATE LOGIN heqcis_readonly WITH PASSWORD = '...';
//     USE Heqcis_web;
//     CREATE USER heqcis_readonly FOR LOGIN heqcis_readonly;
//     GRANT SELECT ON SCHEMA::dbo TO heqcis_readonly;
//     USE msdb;
//     CREATE USER heqcis_readonly FOR LOGIN heqcis_readonly;
//     GRANT SELECT ON dbo.backupset TO heqcis_readonly;
//     GRANT SELECT ON dbo.sysjobs TO heqcis_readonly;
//     GRANT SELECT ON dbo.sysjobhistory TO heqcis_readonly;

import sql from 'mssql';
import type { SqlConfig } from '../common/config.js';
import { logger } from '../common/logger.js';

const CONTEXT = 'sqlClient';

export type SqlRow = Record<string, unknown>;

export interface SqlQueryResult {
  rows: SqlRow[];
  duration_ms: number;
  error: string | null;
}

/**
 * Build an mssql ConnectionPool config from our validated SqlConfig.
 */
function buildPoolConfig(cfg: SqlConfig): sql.config {
  return {
    server:   cfg.server,
    database: cfg.database,
    user:     cfg.user,
    password: cfg.password,
    port:     cfg.port,
    options: {
      encrypt:                cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      enableArithAbort:       true,
    },
    connectionTimeout: cfg.connectTimeoutMs,
    requestTimeout:    cfg.requestTimeoutMs,
    pool: {
      min: 0,
      max: 3,
      idleTimeoutMillis: 30_000,
    },
  };
}

/**
 * Execute a single read-only query. Opens a fresh connection per call.
 * The Azure Functions Consumption plan recycles workers, so we avoid
 * long-lived pool singletons.
 */
export async function runQuery(cfg: SqlConfig, query: string): Promise<SqlQueryResult> {
  const start = Date.now();
  let pool: sql.ConnectionPool | null = null;

  try {
    logger.info(CONTEXT, `Connecting to ${cfg.server}/${cfg.database}`);
    pool = await new sql.ConnectionPool(buildPoolConfig(cfg)).connect();

    const request = pool.request();
    // Enforce read-only intent at the application level
    request.multiple = false;

    const result = await request.query(query);
    const duration_ms = Date.now() - start;

    logger.info(CONTEXT, `Query completed in ${duration_ms}ms, rows=${result.recordset.length}`);

    return {
      rows:        result.recordset as SqlRow[],
      duration_ms,
      error:       null,
    };

  } catch (err: unknown) {
    const duration_ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    // Sanitise: strip passwords from error strings
    const safe = message.replace(/(password|Login failed).*$/i, '$1=[REDACTED]');
    logger.error(CONTEXT, `Query failed in ${duration_ms}ms: ${safe}`);
    return { rows: [], duration_ms, error: safe };

  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore close error */ }
    }
  }
}

/**
 * Perform a lightweight connectivity check (SELECT 1).
 * Returns true if the connection succeeds.
 */
export async function checkConnectivity(cfg: SqlConfig): Promise<{ ok: boolean; duration_ms: number; error: string | null }> {
  const result = await runQuery(cfg, 'SELECT 1 AS ping');
  return {
    ok:          result.error === null,
    duration_ms: result.duration_ms,
    error:       result.error,
  };
}
