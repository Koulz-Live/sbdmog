// server/lib/sqlPool.ts
// Builds a transient mssql ConnectionPool from a sql_connections record.
// Unlike azureSql.ts (which uses a singleton from env vars), this helper
// creates a fresh pool for each named connection — suitable for:
//   - connectivity tests
//   - ETL pushes targeting a specific non-default connection
//
// The pool is NOT cached globally here — callers should close() it when done
// for one-off test calls, or cache it themselves for batch ETL operations.

import * as sql from 'mssql';

// Shape of a row from the sql_connections Supabase table
export interface SqlConnectionRecord {
  id:                       string;
  label:                    string;
  connection_type:          'azure_sql' | 'windows_sql';
  server:                   string;
  port:                     number;
  database_name:            string;
  auth_type:                'sql_auth' | 'windows_auth' | 'managed_identity';
  username:                 string | null;
  secret_ref:               string | null;  // env var key that holds the password
  encrypt:                  boolean;
  trust_server_certificate: boolean;
  connect_timeout_ms:       number;
  request_timeout_ms:       number;
}

/**
 * Resolves the password for a connection record.
 * Looks up `secret_ref` as an environment variable key.
 * Falls back to the global SQL_PASSWORD env var when secret_ref is null.
 */
function resolvePassword(record: SqlConnectionRecord): string {
  if (record.secret_ref) {
    const val = process.env[record.secret_ref];
    if (!val) {
      throw new Error(
        `[sqlPool] Secret ref "${record.secret_ref}" is set on connection "${record.label}" ` +
        `but the corresponding environment variable is not defined.`,
      );
    }
    return val.trim();
  }
  // Fallback to the global default password env var
  const fallback = process.env['SQL_PASSWORD'];
  if (!fallback) {
    throw new Error(
      `[sqlPool] No secret_ref on connection "${record.label}" and SQL_PASSWORD env var is not set.`,
    );
  }
  return fallback.trim();
}

/**
 * Builds and connects an mssql pool from a sql_connections record.
 * The caller is responsible for closing the pool when done.
 */
export async function buildPoolFromRecord(
  record: SqlConnectionRecord,
): Promise<sql.ConnectionPool> {
  const config: sql.config = {
    server:   record.server.trim(),
    database: record.database_name.trim(),
    port:     record.port,
    options: {
      encrypt:                record.encrypt,
      trustServerCertificate: record.trust_server_certificate,
      connectTimeout:         record.connect_timeout_ms,
      requestTimeout:         record.request_timeout_ms,
    },
  };

  if (record.auth_type === 'sql_auth') {
    const username = record.username?.trim();
    if (!username) {
      throw new Error(
        `[sqlPool] Connection "${record.label}" uses sql_auth but no username is configured.`,
      );
    }
    config.user     = username;
    config.password = resolvePassword(record);
  } else if (record.auth_type === 'windows_auth') {
    // Windows Integrated Auth — works only when the server process has
    // the correct Windows identity. Requires domain & userName set via env.
    config.domain   = (process.env['SQL_DOMAIN'] ?? '').trim() || undefined;
    config.user     = record.username?.trim() ?? '';
    config.password = resolvePassword(record);
    (config.options as Record<string, unknown>)['trustedConnection'] = true;
  }
  // managed_identity — no credentials needed; mssql picks up the ambient identity

  console.log(
    `[sqlPool] Building pool → label="${record.label}" server="${record.server}" ` +
    `db="${record.database_name}" auth="${record.auth_type}"`,
  );

  const pool = await sql.connect(config);
  return pool;
}

// ── Per-connection pool cache ─────────────────────────────────────────────────
// For ETL pushes that send many rows we cache the pool by connection ID to
// avoid reconnecting on every batch.

const _poolCache = new Map<string, sql.ConnectionPool>();

export async function getPoolForConnection(
  record: SqlConnectionRecord,
): Promise<sql.ConnectionPool> {
  const cached = _poolCache.get(record.id);
  if (cached?.connected) return cached;

  const pool = await buildPoolFromRecord(record);
  pool.on('error', () => { _poolCache.delete(record.id); });
  _poolCache.set(record.id, pool);
  return pool;
}
