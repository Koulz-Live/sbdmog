// server/lib/azureSql.ts
// Lightweight Azure SQL client for the Express server.
// Reads connection details from environment variables.
// Uses a module-level singleton pool so connections are reused across
// requests within the same serverless function warm instance.

import * as sql from 'mssql';

// ─── Connection config ────────────────────────────────────────────────────────

function buildConfig(): sql.config {
  // .trim() guards against trailing newlines/spaces accidentally pasted into Vercel env vars
  const server   = (process.env['SQL_SERVER']   ?? '').trim();
  const database = (process.env['SQL_DATABASE'] ?? '').trim();
  const user     = (process.env['SQL_USER']     ?? '').trim();
  const password = (process.env['SQL_PASSWORD'] ?? '').trim();

  if (!server || !database || !user || !password) {
    throw new Error(
      '[azureSql] Missing SQL env vars: SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD',
    );
  }

  console.log(
    `[azureSql] Connecting → server="${server}" db="${database}" user="${user}" ` +
    `user_length=${user.length} server_length=${server.length}`,
  );

  return {
    server,
    database,
    user,
    password,
    port:    parseInt(process.env['SQL_PORT'] ?? '1433', 10),
    options: {
      encrypt:                true,
      // trustServerCertificate must be true in serverless runtimes (Vercel/Lambda).
      // The tedious TLS stack rejects Azure SQL's wildcard cert (*.database.windows.net)
      // even though it is technically valid — traffic is still fully encrypted.
      trustServerCertificate: true,
      connectTimeout:         15_000,
      requestTimeout:         20_000,
    },
  };
}

// ─── Singleton pool ───────────────────────────────────────────────────────────

let _pool: sql.ConnectionPool | null = null;
let _poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (_pool?.connected) return _pool;

  if (_poolPromise) return _poolPromise;

  _poolPromise = sql.connect(buildConfig()).then((pool) => {
    _pool = pool;
    pool.on('error', () => {
      _pool        = null;
      _poolPromise = null;
    });
    return pool;
  });

  return _poolPromise;
}

// ─── Query helper ─────────────────────────────────────────────────────────────

export interface QueryResult<T = Record<string, unknown>> {
  rows:  T[];
  error: string | null;
}

export async function runQuery<T = Record<string, unknown>>(
  query: string,
): Promise<QueryResult<T>> {
  try {
    const pool   = await getPool();
    const result = await pool.request().query(query);
    return { rows: result.recordset as T[], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { rows: [], error: message };
  }
}

// ─── Connectivity probe ───────────────────────────────────────────────────────

export async function checkConnectivity(): Promise<{ ok: boolean; latencyMs: number; error: string | null }> {
  const t0 = Date.now();
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ping');
    return { ok: true, latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    return {
      ok:        false,
      latencyMs: Date.now() - t0,
      error:     err instanceof Error ? err.message : String(err),
    };
  }
}
