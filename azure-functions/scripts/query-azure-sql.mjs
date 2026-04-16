#!/usr/bin/env node
/**
 * HEQCIS — Interactive Azure SQL Query Runner
 *
 * Usage:
 *   node scripts/query-azure-sql.mjs
 *   node scripts/query-azure-sql.mjs --query "SELECT TOP 5 * FROM dbo.SomeTable"
 *   node scripts/query-azure-sql.mjs --preset backups
 *
 * Connection: reads from environment variables (same as Azure Functions).
 * Set them in your shell or copy local.settings.json values first:
 *
 *   export SQL_SERVER=your-server.database.windows.net
 *   export SQL_DATABASE=Heqcis_web
 *   export SQL_USER=heqcis_readonly
 *   export SQL_PASSWORD=your-password
 *   export SQL_ENCRYPT=true
 *   export SQL_TRUST_SERVER_CERT=false     # true if using self-signed cert
 */

import sql from 'mssql';
import readline from 'readline';

// ─── Connection config from env ───────────────────────────────────────────

const REQUIRED = ['SQL_SERVER', 'SQL_DATABASE', 'SQL_USER', 'SQL_PASSWORD'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n❌  Missing required environment variables:');
  missing.forEach(k => console.error(`     ${k}`));
  console.error('\nSet them in your shell, e.g.:');
  console.error('  export SQL_SERVER=heqcis.database.windows.net');
  console.error('  export SQL_DATABASE=heqcis');
  console.error('  export SQL_USER=heqcis');
  console.error('  export SQL_PASSWORD=yourpassword\n');
  process.exit(1);
}

const cfg = {
  server:   process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user:     process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  port:     parseInt(process.env.SQL_PORT ?? '1433', 10),
  options: {
    encrypt:                (process.env.SQL_ENCRYPT ?? 'true') !== 'false',
    trustServerCertificate: (process.env.SQL_TRUST_SERVER_CERT ?? 'false') === 'true',
    enableArithAbort:       true,
  },
  connectionTimeout: 15_000,
  requestTimeout:    30_000,
};

// ─── Preset queries ───────────────────────────────────────────────────────

const PRESETS = {
  // ── Connectivity / health ──────────────────────────────────────────────
  ping: {
    label: 'Connectivity ping',
    query: 'SELECT 1 AS ping, GETUTCDATE() AS server_time, @@VERSION AS sql_version',
  },
  connections: {
    label: 'Active user connections',
    query: `
      SELECT
        s.session_id,
        s.login_name,
        s.host_name,
        s.program_name,
        s.status,
        s.cpu_time,
        s.memory_usage,
        DATEDIFF(SECOND, s.last_request_start_time, GETUTCDATE()) AS idle_seconds
      FROM sys.dm_exec_sessions s
      WHERE s.is_user_process = 1
      ORDER BY s.last_request_start_time DESC
    `,
  },
  db_size: {
    label: 'Database file sizes',
    query: `
      SELECT
        name,
        type_desc,
        CAST(size * 8.0 / 1024 AS DECIMAL(10,2))       AS size_mb,
        CAST(FILEPROPERTY(name,'SpaceUsed') * 8.0 / 1024 AS DECIMAL(10,2)) AS used_mb,
        physical_name
      FROM sys.database_files
    `,
  },
  long_queries: {
    label: 'Long-running queries (> 10 seconds)',
    query: `
      SELECT
        r.session_id,
        r.status,
        r.blocking_session_id,
        r.wait_type,
        r.wait_time,
        DATEDIFF(SECOND, r.start_time, GETUTCDATE()) AS running_seconds,
        r.logical_reads,
        SUBSTRING(t.text, (r.statement_start_offset/2)+1,
          ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(t.text)
            ELSE r.statement_end_offset END - r.statement_start_offset)/2)+1
        ) AS statement_text
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.status != 'background'
        AND DATEDIFF(SECOND, r.start_time, GETUTCDATE()) > 10
      ORDER BY running_seconds DESC
    `,
  },

  // ── Backup queries ─────────────────────────────────────────────────────
  backups: {
    label: 'Last 20 backups (msdb.dbo.backupset)',
    query: `
      SELECT TOP 20
        bs.database_name,
        CASE bs.type
          WHEN 'D' THEN 'full'
          WHEN 'I' THEN 'differential'
          WHEN 'L' THEN 'log'
          ELSE bs.type
        END AS backup_type,
        bs.backup_start_date,
        bs.backup_finish_date,
        DATEDIFF(SECOND, bs.backup_start_date, bs.backup_finish_date) AS duration_seconds,
        CAST(bs.backup_size / 1073741824.0 AS DECIMAL(10,2)) AS size_gb,
        bs.is_damaged,
        bs.has_bulk_logged_data,
        bs.server_name,
        bs.user_name
      FROM msdb.dbo.backupset bs
      ORDER BY bs.backup_start_date DESC
    `,
  },
  backup_gaps: {
    label: 'Hours since last full backup per database',
    query: `
      SELECT
        bs.database_name,
        MAX(bs.backup_start_date) AS last_full_backup,
        DATEDIFF(HOUR, MAX(bs.backup_start_date), GETUTCDATE()) AS hours_since_backup,
        CASE
          WHEN DATEDIFF(HOUR, MAX(bs.backup_start_date), GETUTCDATE()) > 25 THEN '⚠  OVERDUE'
          ELSE '✓ OK'
        END AS status
      FROM msdb.dbo.backupset bs
      WHERE bs.type = 'D'   -- full backups only
        AND bs.backup_finish_date IS NOT NULL
      GROUP BY bs.database_name
      ORDER BY hours_since_backup DESC
    `,
  },
  backup_destinations: {
    label: 'Backup file destinations',
    query: `
      SELECT TOP 10
        bs.database_name,
        bs.backup_start_date,
        CASE bs.type WHEN 'D' THEN 'full' WHEN 'I' THEN 'diff' WHEN 'L' THEN 'log' ELSE bs.type END AS type,
        bmf.physical_device_name AS backup_path
      FROM msdb.dbo.backupset bs
      JOIN msdb.dbo.backupmediafamily bmf ON bs.media_set_id = bmf.media_set_id
      ORDER BY bs.backup_start_date DESC
    `,
  },

  // ── ETL / SQL Agent jobs ───────────────────────────────────────────────
  jobs: {
    label: 'All SQL Agent jobs',
    query: `
      SELECT
        j.name AS job_name,
        j.enabled,
        CASE j.enabled WHEN 1 THEN 'enabled' ELSE 'disabled' END AS state,
        j.description,
        j.date_created,
        j.date_modified
      FROM msdb.dbo.sysjobs j
      ORDER BY j.name
    `,
  },
  job_history: {
    label: 'Recent SQL Agent job run history (last 50)',
    query: `
      SELECT TOP 50
        j.name AS job_name,
        h.step_id,
        h.step_name,
        CONVERT(DATETIME,
          STUFF(STUFF(CAST(h.run_date AS VARCHAR),7,0,'-'),5,0,'-') + ' ' +
          STUFF(STUFF(RIGHT('000000'+CAST(h.run_time AS VARCHAR),6),5,0,':'),3,0,':')
        ) AS run_at,
        CASE h.run_status
          WHEN 0 THEN 'failed'
          WHEN 1 THEN 'succeeded'
          WHEN 2 THEN 'retry'
          WHEN 3 THEN 'cancelled'
          WHEN 4 THEN 'in_progress'
        END AS run_status,
        h.run_duration AS duration_hhmmss,
        h.message
      FROM msdb.dbo.sysjobhistory h
      JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
      WHERE h.step_id = 0   -- job-level outcome only
      ORDER BY h.run_date DESC, h.run_time DESC
    `,
  },
  failed_jobs: {
    label: 'Failed SQL Agent jobs (last 7 days)',
    query: `
      SELECT
        j.name AS job_name,
        CONVERT(DATETIME,
          STUFF(STUFF(CAST(h.run_date AS VARCHAR),7,0,'-'),5,0,'-') + ' ' +
          STUFF(STUFF(RIGHT('000000'+CAST(h.run_time AS VARCHAR),6),5,0,':'),3,0,':')
        ) AS failed_at,
        h.message
      FROM msdb.dbo.sysjobhistory h
      JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
      WHERE h.step_id = 0
        AND h.run_status = 0
        AND h.run_date >= CAST(CONVERT(VARCHAR, DATEADD(DAY,-7,GETUTCDATE()), 112) AS INT)
      ORDER BY h.run_date DESC, h.run_time DESC
    `,
  },

  // ── Schema exploration ─────────────────────────────────────────────────
  tables: {
    label: 'All user tables in the database',
    query: `
      SELECT
        t.TABLE_SCHEMA,
        t.TABLE_NAME,
        p.rows AS row_count,
        CAST(SUM(a.total_pages) * 8 / 1024.0 AS DECIMAL(10,2)) AS size_mb
      FROM INFORMATION_SCHEMA.TABLES t
      JOIN sys.tables st ON st.name = t.TABLE_NAME
      JOIN sys.partitions p ON p.object_id = st.object_id AND p.index_id IN (0,1)
      JOIN sys.allocation_units a ON a.container_id = p.partition_id
      WHERE t.TABLE_TYPE = 'BASE TABLE'
      GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME, p.rows
      ORDER BY p.rows DESC
    `,
  },
  views: {
    label: 'All views in the database',
    query: `
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.VIEWS
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `,
  },
  indexes: {
    label: 'Index usage stats (top 20 by seeks)',
    query: `
      SELECT TOP 20
        OBJECT_NAME(i.object_id) AS table_name,
        i.name AS index_name,
        i.type_desc,
        s.user_seeks,
        s.user_scans,
        s.user_lookups,
        s.user_updates,
        s.last_user_seek
      FROM sys.indexes i
      LEFT JOIN sys.dm_db_index_usage_stats s
        ON s.object_id = i.object_id
        AND s.index_id = i.index_id
        AND s.database_id = DB_ID()
      WHERE OBJECTPROPERTY(i.object_id, 'IsUserTable') = 1
        AND i.type > 0
      ORDER BY COALESCE(s.user_seeks,0) DESC
    `,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function printTable(rows) {
  if (!rows || rows.length === 0) {
    console.log('  (no rows returned)\n');
    return;
  }
  const cols  = Object.keys(rows[0]);
  const widths = cols.map(c =>
    Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length))
  );
  const line = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const row  = (r) => '| ' + cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join(' | ') + ' |';

  console.log(line);
  console.log('| ' + cols.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |');
  console.log(line);
  rows.forEach(r => console.log(row(r)));
  console.log(line);
  console.log(`  ${rows.length} row(s)\n`);
}

async function runQuery(pool, query) {
  const start  = Date.now();
  const result = await pool.request().query(query.trim());
  const ms     = Date.now() - start;
  return { rows: result.recordset, ms };
}

function showPresets() {
  console.log('\nAvailable --preset values:\n');
  const groups = {
    'Health':   ['ping','connections','db_size','long_queries'],
    'Backups':  ['backups','backup_gaps','backup_destinations'],
    'ETL/Jobs': ['jobs','job_history','failed_jobs'],
    'Schema':   ['tables','views','indexes'],
  };
  for (const [group, keys] of Object.entries(groups)) {
    console.log(`  ${group}`);
    for (const k of keys) {
      console.log(`    --preset ${k.padEnd(22)} ${PRESETS[k].label}`);
    }
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const qIdx    = args.indexOf('--query');
  const pIdx    = args.indexOf('--preset');
  const listIdx = args.indexOf('--list');

  if (listIdx !== -1) {
    showPresets();
    process.exit(0);
  }

  console.log(`\n🔌  Connecting to ${cfg.server} / ${cfg.database} …`);
  let pool;
  try {
    pool = await new sql.ConnectionPool(cfg).connect();
    console.log('✅  Connected\n');
  } catch (err) {
    console.error(`❌  Connection failed: ${err.message}\n`);
    process.exit(1);
  }

  // Single --preset run
  if (pIdx !== -1) {
    const key = args[pIdx + 1];
    const preset = PRESETS[key];
    if (!preset) {
      console.error(`❌  Unknown preset "${key}". Run with --list to see options.\n`);
      await pool.close();
      process.exit(1);
    }
    console.log(`▶  ${preset.label}\n`);
    try {
      const { rows, ms } = await runQuery(pool, preset.query);
      printTable(rows);
      console.log(`⏱  ${ms}ms\n`);
    } catch (err) {
      console.error(`❌  Query error: ${err.message}\n`);
    }
    await pool.close();
    return;
  }

  // Single --query run
  if (qIdx !== -1) {
    const q = args[qIdx + 1];
    if (!q) {
      console.error('❌  --query requires a SQL string.\n');
      await pool.close();
      process.exit(1);
    }
    try {
      const { rows, ms } = await runQuery(pool, q);
      printTable(rows);
      console.log(`⏱  ${ms}ms\n`);
    } catch (err) {
      console.error(`❌  Query error: ${err.message}\n`);
    }
    await pool.close();
    return;
  }

  // ── Interactive REPL ──────────────────────────────────────────────────
  console.log('💬  Interactive SQL REPL — type a query and press Enter twice to run.');
  console.log('    Commands:  \\presets   list preset queries');
  console.log('               \\preset <name>  run a preset');
  console.log('               \\quit      exit\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let buffer = [];

  const prompt = () => process.stdout.write(buffer.length ? '    > ' : 'SQL > ');
  prompt();

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === '\\quit' || trimmed === '\\exit' || trimmed === 'exit') {
      console.log('\nBye!\n');
      break;
    }

    if (trimmed === '\\presets' || trimmed === '\\list') {
      showPresets();
      prompt();
      continue;
    }

    if (trimmed.startsWith('\\preset ')) {
      const key = trimmed.slice(8).trim();
      const preset = PRESETS[key];
      if (!preset) {
        console.log(`❌  Unknown preset "${key}". Type \\presets to list them.\n`);
      } else {
        console.log(`\n▶  ${preset.label}\n`);
        try {
          const { rows, ms } = await runQuery(pool, preset.query);
          printTable(rows);
          console.log(`⏱  ${ms}ms\n`);
        } catch (err) {
          console.error(`❌  ${err.message}\n`);
        }
      }
      prompt();
      continue;
    }

    buffer.push(line);

    // Run on blank line or semicolon termination
    if (trimmed === '' || trimmed.endsWith(';')) {
      const query = buffer.join('\n').replace(/;\s*$/, '').trim();
      buffer = [];
      if (query) {
        try {
          const { rows, ms } = await runQuery(pool, query);
          printTable(rows);
          console.log(`⏱  ${ms}ms\n`);
        } catch (err) {
          console.error(`❌  ${err.message}\n`);
        }
      }
    }

    prompt();
  }

  await pool.close();
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}\n`);
  process.exit(1);
});
