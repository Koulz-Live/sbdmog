#!/usr/bin/env node
// azure-functions/scripts/deploy-schema.mjs
//
// Deploys the HEQCIS monitoring schema to Azure SQL Database.
//
// Creates two tables that replace the on-prem msdb system tables:
//   dbo.backup_history   — mirrors msdb.dbo.backupset
//   dbo.etl_job_history  — mirrors msdb.dbo.sysjobs + sysjobhistory
//
// Usage:
//   node scripts/deploy-schema.mjs [--seed] [--drop] [--status]
//
//   --seed    Insert realistic HEQCIS seed data after creating tables
//   --drop    Drop and recreate tables (destructive!)
//   --status  Show current row counts only (no DDL)
//
// Environment (loaded from local.settings.json automatically):
//   SQL_SERVER, SQL_DATABASE, SQL_USER, SQL_PASSWORD

import { createRequire } from 'module';
import { readFileSync }   from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';

const require = createRequire(import.meta.url);
const sql     = require('mssql');

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load env from local.settings.json ───────────────────────────────────────

const settingsPath = join(__dirname, '..', 'local.settings.json');
try {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const values   = settings.Values ?? {};
  for (const [k, v] of Object.entries(values)) {
    if (!process.env[k]) process.env[k] = String(v);
  }
} catch {
  // fall through — rely on environment variables already set
}

// ─── Config ───────────────────────────────────────────────────────────────────

const config = {
  server:   process.env.SQL_SERVER   ?? 'heqcis.database.windows.net',
  database: process.env.SQL_DATABASE ?? 'heqcis',
  user:     process.env.SQL_USER     ?? 'heqcis',
  password: process.env.SQL_PASSWORD ?? '',
  port:     parseInt(process.env.SQL_PORT ?? '1433', 10),
  options: {
    encrypt:                true,
    trustServerCertificate: false,
    connectTimeout:         20_000,
    requestTimeout:         60_000,
  },
};

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const DROP   = args.includes('--drop');
const SEED   = args.includes('--seed');
const STATUS = args.includes('--status');

// ─── DDL ──────────────────────────────────────────────────────────────────────

const DDL_DROP_BACKUP = `
IF OBJECT_ID('dbo.backup_history', 'U') IS NOT NULL
  DROP TABLE dbo.backup_history;
`;

const DDL_DROP_ETL = `
IF OBJECT_ID('dbo.etl_job_history', 'U') IS NOT NULL
  DROP TABLE dbo.etl_job_history;
`;

const DDL_CREATE_BACKUP = `
IF OBJECT_ID('dbo.backup_history', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.backup_history (
    id                    INT            IDENTITY(1,1) PRIMARY KEY,
    database_name         NVARCHAR(128)  NOT NULL,
    backup_start_date     DATETIME2(0)   NOT NULL,
    backup_finish_date    DATETIME2(0)   NULL,
    type                  CHAR(1)        NOT NULL,   -- D=full, I=diff, L=log
    backup_size           BIGINT         NULL,       -- bytes
    is_damaged            BIT            NOT NULL DEFAULT 0,
    has_bulk_logged_data  BIT            NOT NULL DEFAULT 0,
    backup_destination    NVARCHAR(500)  NULL,
    compressed_size       BIGINT         NULL,
    server_name           NVARCHAR(128)  NULL,
    machine_name          NVARCHAR(128)  NULL,
    software_version      NVARCHAR(64)   NULL,
    created_at            DATETIME2(0)   NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE NONCLUSTERED INDEX IX_backup_history_db_start
    ON dbo.backup_history (database_name, backup_start_date DESC);
END
`;

const DDL_CREATE_ETL = `
IF OBJECT_ID('dbo.etl_job_history', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.etl_job_history (
    id            INT            IDENTITY(1,1) PRIMARY KEY,
    job_id        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    name          NVARCHAR(256)  NOT NULL,
    enabled       BIT            NOT NULL DEFAULT 1,
    date_created  DATETIME2(0)   NULL,
    date_modified DATETIME2(0)   NULL,
    run_date      INT            NULL,   -- YYYYMMDD integer (msdb format)
    run_time      INT            NULL,   -- HHMMSS  integer (msdb format)
    run_status    INT            NULL,   -- 0=fail, 1=success, 2=retry, 3=cancel, 4=running
    step_id       INT            NOT NULL DEFAULT 0,
    message       NVARCHAR(MAX)  NULL,
    created_at    DATETIME2(0)   NOT NULL DEFAULT GETUTCDATE()
  );
  CREATE NONCLUSTERED INDEX IX_etl_job_history_name_date
    ON dbo.etl_job_history (name, run_date DESC, run_time DESC);
END
`;

// ─── Seed data ────────────────────────────────────────────────────────────────
// Realistic HEQCIS backup history — 30 rows spanning the last 30 days.
// Types: D=full (daily), I=differential (every 6h), L=log (every hour).
// Sizes in bytes: full ~8GB, diff ~1.2GB, log ~300MB.

function buildBackupSeedRows() {
  const rows = [];
  const now  = new Date();
  const DB   = 'Heqcis_web';
  const SRV  = 'HEQCIS-SQL01';
  const DEST = 'E:\\SQLBackups\\Heqcis_web';
  const VER  = '15.0.4420.2';

  // 30 daily FULL backups
  for (let d = 0; d < 30; d++) {
    const start  = new Date(now.getTime() - d * 86_400_000 - 2 * 3_600_000);
    const finish = new Date(start.getTime() + 47 * 60_000 + Math.floor(Math.random() * 5 * 60_000));
    const size   = 8_200_000_000 + Math.floor(Math.random() * 400_000_000);
    rows.push({
      database_name:        DB,
      backup_start_date:    start.toISOString().slice(0, 19).replace('T', ' '),
      backup_finish_date:   finish.toISOString().slice(0, 19).replace('T', ' '),
      type:                 'D',
      backup_size:          size,
      is_damaged:           0,
      has_bulk_logged_data: 0,
      backup_destination:   `${DEST}\\FULL_${start.toISOString().slice(0,10)}.bak`,
      compressed_size:      Math.floor(size * 0.42),
      server_name:          SRV,
      machine_name:         SRV,
      software_version:     VER,
    });
  }

  // 60 differential backups (every 6 hours for the last 15 days)
  for (let h = 0; h < 60; h++) {
    const start  = new Date(now.getTime() - h * 6 * 3_600_000 - 12 * 60_000);
    const finish = new Date(start.getTime() + 8 * 60_000 + Math.floor(Math.random() * 3 * 60_000));
    const size   = 1_150_000_000 + Math.floor(Math.random() * 200_000_000);
    rows.push({
      database_name:        DB,
      backup_start_date:    start.toISOString().slice(0, 19).replace('T', ' '),
      backup_finish_date:   finish.toISOString().slice(0, 19).replace('T', ' '),
      type:                 'I',
      backup_size:          size,
      is_damaged:           0,
      has_bulk_logged_data: 0,
      backup_destination:   `${DEST}\\DIFF_${start.toISOString().slice(0,13)}.bak`,
      compressed_size:      Math.floor(size * 0.45),
      server_name:          SRV,
      machine_name:         SRV,
      software_version:     VER,
    });
  }

  // 24 log backups (every hour for the last day)
  for (let h = 0; h < 24; h++) {
    const start  = new Date(now.getTime() - h * 3_600_000 - 3 * 60_000);
    const finish = new Date(start.getTime() + 90_000 + Math.floor(Math.random() * 60_000));
    const size   = 280_000_000 + Math.floor(Math.random() * 80_000_000);
    rows.push({
      database_name:        DB,
      backup_start_date:    start.toISOString().slice(0, 19).replace('T', ' '),
      backup_finish_date:   finish.toISOString().slice(0, 19).replace('T', ' '),
      type:                 'L',
      backup_size:          size,
      is_damaged:           0,
      has_bulk_logged_data: 1,
      backup_destination:   `${DEST}\\LOG_${start.toISOString().slice(0,16).replace(':', '')}.bak`,
      compressed_size:      Math.floor(size * 0.55),
      server_name:          SRV,
      machine_name:         SRV,
      software_version:     VER,
    });
  }

  return rows;
}

function buildEtlSeedRows() {
  const rows   = [];
  const now    = new Date();
  const JOB    = 'HEQCISWEB_Job';
  const JOB_ID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
  const created = new Date(now.getTime() - 365 * 86_400_000);

  // 48 ETL runs — every 30 minutes for the last day
  for (let i = 0; i < 48; i++) {
    const runDt  = new Date(now.getTime() - i * 30 * 60_000);
    // Mostly success (1), one failure around 18 runs ago, one cancelled at 35 runs ago
    let status = 1;
    let message = 'The job succeeded.  The Job was invoked by Schedule 1 (HEQCISWEB_Schedule). The last step to run was step 1 (Run Pentaho ETL).';
    if (i === 18) {
      status  = 0;
      message = 'The job failed.  The Job was invoked by Schedule 1 (HEQCISWEB_Schedule). The last step to run was step 1 (Run Pentaho ETL). Step 1 failed with exit code 1. Error: Pentaho kitchen.sh returned exit code 1 — check Pentaho log at C:\\Pentaho\\logs\\HEQCISWEB_Job.log';
    } else if (i === 35) {
      status  = 3;
      message = 'The job was cancelled by the operator (sa). The last step to run was step 1 (Run Pentaho ETL).';
    }

    // msdb run_date/run_time integer format
    const y  = runDt.getUTCFullYear();
    const mo = String(runDt.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(runDt.getUTCDate()).padStart(2, '0');
    const h  = String(runDt.getUTCHours()).padStart(2, '0');
    const mi = String(runDt.getUTCMinutes()).padStart(2, '0');
    const s  = String(runDt.getUTCSeconds()).padStart(2, '0');

    rows.push({
      job_id:       JOB_ID,
      name:         JOB,
      enabled:      1,
      date_created: created.toISOString().slice(0, 19).replace('T', ' '),
      date_modified: new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 19).replace('T', ' '),
      run_date:     parseInt(`${y}${mo}${d}`, 10),
      run_time:     parseInt(`${h}${mi}${s}`, 10),
      run_status:   status,
      step_id:      0,
      message,
    });
  }

  return rows;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(s, n) {
  return String(s).padEnd(n);
}

function fmt(n) {
  return n.toLocaleString();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔌  Connecting to', config.server, '/', config.database, '…');
  let pool;
  try {
    pool = await sql.connect(config);
    console.log('✅  Connected\n');
  } catch (err) {
    console.error('❌  Connection failed:', err.message);
    process.exit(1);
  }

  try {
    // ── Status only ──────────────────────────────────────────────────────────
    if (STATUS) {
      for (const [label, table] of [
        ['backup_history', 'dbo.backup_history'],
        ['etl_job_history', 'dbo.etl_job_history'],
      ]) {
        const exists = await pool.request().query(
          `SELECT OBJECT_ID('${table}', 'U') AS id`,
        );
        if (exists.recordset[0].id === null) {
          console.log(`  ${label}: ⚠️  table does not exist`);
        } else {
          const cnt = await pool.request().query(`SELECT COUNT(*) AS n FROM ${table}`);
          console.log(`  ${label}: ${fmt(cnt.recordset[0].n)} rows`);
        }
      }
      return;
    }

    // ── Drop (optional) ──────────────────────────────────────────────────────
    if (DROP) {
      console.log('⚠️   DROP requested — removing existing tables …');
      await pool.request().query(DDL_DROP_ETL);
      await pool.request().query(DDL_DROP_BACKUP);
      console.log('    Tables dropped.\n');
    }

    // ── Create tables ────────────────────────────────────────────────────────
    console.log('📐  Creating tables (if not exists) …');
    await pool.request().query(DDL_CREATE_BACKUP);
    console.log('    ✅  dbo.backup_history');
    await pool.request().query(DDL_CREATE_ETL);
    console.log('    ✅  dbo.etl_job_history\n');

    // ── Seed ─────────────────────────────────────────────────────────────────
    if (SEED) {
      // Check if already has data (avoid duplicate seed)
      const bCnt = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.backup_history');
      const eCnt = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.etl_job_history');
      const bHas = bCnt.recordset[0].n > 0;
      const eHas = eCnt.recordset[0].n > 0;

      if (bHas || eHas) {
        console.log(`ℹ️   Tables already have data (backup_history: ${fmt(bCnt.recordset[0].n)}, etl_job_history: ${fmt(eCnt.recordset[0].n)} rows).`);
        console.log('    Re-run with --drop --seed to replace all data.\n');
      } else {
        // Seed backup_history
        console.log('🌱  Seeding dbo.backup_history …');
        const backupRows = buildBackupSeedRows();
        let bInserted = 0;
        for (const r of backupRows) {
          const req = pool.request();
          req.input('database_name',        sql.NVarChar(128), r.database_name);
          req.input('backup_start_date',    sql.DateTime2,     r.backup_start_date);
          req.input('backup_finish_date',   sql.DateTime2,     r.backup_finish_date);
          req.input('type',                 sql.Char(1),       r.type);
          req.input('backup_size',          sql.BigInt,        r.backup_size);
          req.input('is_damaged',           sql.Bit,           r.is_damaged);
          req.input('has_bulk_logged_data', sql.Bit,           r.has_bulk_logged_data);
          req.input('backup_destination',   sql.NVarChar(500), r.backup_destination);
          req.input('compressed_size',      sql.BigInt,        r.compressed_size);
          req.input('server_name',          sql.NVarChar(128), r.server_name);
          req.input('machine_name',         sql.NVarChar(128), r.machine_name);
          req.input('software_version',     sql.NVarChar(64),  r.software_version);
          await req.query(`
            INSERT INTO dbo.backup_history
              (database_name, backup_start_date, backup_finish_date, type,
               backup_size, is_damaged, has_bulk_logged_data, backup_destination,
               compressed_size, server_name, machine_name, software_version)
            VALUES
              (@database_name, @backup_start_date, @backup_finish_date, @type,
               @backup_size, @is_damaged, @has_bulk_logged_data, @backup_destination,
               @compressed_size, @server_name, @machine_name, @software_version)
          `);
          bInserted++;
        }
        console.log(`    ✅  ${fmt(bInserted)} rows inserted\n`);

        // Seed etl_job_history
        console.log('🌱  Seeding dbo.etl_job_history …');
        const etlRows = buildEtlSeedRows();
        let eInserted = 0;
        for (const r of etlRows) {
          const req = pool.request();
          req.input('job_id',       sql.UniqueIdentifier, r.job_id);
          req.input('name',         sql.NVarChar(256),    r.name);
          req.input('enabled',      sql.Bit,              r.enabled);
          req.input('date_created', sql.DateTime2,        r.date_created);
          req.input('date_modified',sql.DateTime2,        r.date_modified);
          req.input('run_date',     sql.Int,              r.run_date);
          req.input('run_time',     sql.Int,              r.run_time);
          req.input('run_status',   sql.Int,              r.run_status);
          req.input('step_id',      sql.Int,              r.step_id);
          req.input('message',      sql.NVarChar(sql.MAX),r.message);
          await req.query(`
            INSERT INTO dbo.etl_job_history
              (job_id, name, enabled, date_created, date_modified,
               run_date, run_time, run_status, step_id, message)
            VALUES
              (@job_id, @name, @enabled, @date_created, @date_modified,
               @run_date, @run_time, @run_status, @step_id, @message)
          `);
          eInserted++;
        }
        console.log(`    ✅  ${fmt(eInserted)} rows inserted\n`);
      }
    }

    // ── Verify ───────────────────────────────────────────────────────────────
    console.log('🔍  Verification:');
    for (const [label, table, orderBy] of [
      ['backup_history',  'dbo.backup_history',  'backup_start_date DESC'],
      ['etl_job_history', 'dbo.etl_job_history', 'run_date DESC, run_time DESC'],
    ]) {
      const cnt  = await pool.request().query(`SELECT COUNT(*) AS n FROM ${table}`);
      const last = await pool.request().query(
        `SELECT TOP 1 * FROM ${table} ORDER BY ${orderBy}`,
      );
      console.log(`\n  ${label}: ${fmt(cnt.recordset[0].n)} rows`);
      if (last.recordset.length > 0) {
        const row = last.recordset[0];
        const cols = Object.keys(row);
        const maxKey = Math.max(...cols.map((c) => c.length));
        for (const col of cols) {
          const val = row[col];
          const display = val instanceof Date ? val.toISOString() : String(val ?? 'NULL');
          console.log(`    ${pad(col, maxKey + 2)} ${display}`);
        }
      }
    }

    console.log('\n✅  Schema deployment complete.\n');
    console.log('📋  Next steps — add these to local.settings.json → Values:');
    console.log('');
    console.log('  "BACKUP_SQL_QUERY": "SELECT TOP 20 database_name, backup_start_date, backup_finish_date, type, backup_size, is_damaged, has_bulk_logged_data FROM dbo.backup_history WHERE database_name = \'Heqcis_web\' ORDER BY backup_start_date DESC",');
    console.log('');
    console.log('  "ETL_SQL_QUERY": "SELECT TOP 5 job_id, name, enabled, date_created, run_date, run_time, run_status, message FROM dbo.etl_job_history WHERE name = \'HEQCISWEB_Job\' AND step_id = 0 ORDER BY run_date DESC, run_time DESC",');
    console.log('');

  } catch (err) {
    console.error('\n❌  Error:', err.message);
    if (err.originalError) console.error('    Original:', err.originalError.message);
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
