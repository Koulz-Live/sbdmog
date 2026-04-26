-- supabase/migrations/021_db_performance_logs.sql
-- Database Performance Monitoring Logs
-- Stores daily auto-logged snapshots of SQL Server performance metrics:
--   wait statistics, top slow queries, blocking chains, resource pressure.
-- AI analysis summaries are stored alongside each run.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
create table if not exists db_performance_logs (
  id             uuid        primary key default gen_random_uuid(),

  -- When the check ran
  checked_at     timestamptz not null default now(),

  -- Overall status determined by thresholds
  status         text        not null default 'healthy'
    check (status in ('healthy', 'degraded', 'critical', 'unreachable', 'unknown')),

  -- How long the collection took (ms)
  duration_ms    integer     not null default 0,

  -- Source environment tag
  environment    text        not null default 'production',

  -- ── Wait statistics (top waits by total wait time) ─────────────────────────
  wait_stats     jsonb,
  -- e.g. [{ wait_type, waiting_tasks, wait_time_ms, signal_wait_ms, pct_of_total }]

  -- ── Top slow queries (longest avg duration) ────────────────────────────────
  slow_queries   jsonb,
  -- e.g. [{ query_hash, avg_duration_ms, execution_count, total_logical_reads, query_text }]

  -- ── Active blocking chains ─────────────────────────────────────────────────
  blocking       jsonb,
  -- e.g. [{ blocking_spid, blocked_spid, wait_time_ms, blocked_query }]

  -- ── Resource pressure metrics ──────────────────────────────────────────────
  cpu_pct        numeric(5,2),          -- avg CPU% over last minute
  memory_pct     numeric(5,2),          -- buffer pool pressure %
  disk_read_ms   numeric(12,2),         -- avg disk read stall ms
  disk_write_ms  numeric(12,2),         -- avg disk write stall ms
  active_connections integer,
  long_running_count integer default 0, -- queries running > 5 min

  -- ── Raw detail array (all individual check items) ─────────────────────────
  details        jsonb,

  -- ── Error if the check could not complete ─────────────────────────────────
  error_message  text,

  -- ── AI analysis ───────────────────────────────────────────────────────────
  ai_summary     text,           -- plain-English summary
  ai_actions     jsonb,          -- recommended actions array
  ai_severity    text            -- 'low' | 'medium' | 'high' | 'critical'
    check (ai_severity is null or ai_severity in ('low','medium','high','critical')),
  ai_generated_at timestamptz,

  created_at     timestamptz not null default now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
create index if not exists db_perf_logs_checked_at_idx on db_performance_logs(checked_at desc);
create index if not exists db_perf_logs_status_idx     on db_performance_logs(status, checked_at desc);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
alter table db_performance_logs enable row level security;

create policy "db_perf_logs_admin_all" on db_performance_logs
  for all using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin','engineer')
    )
  );

create policy "db_perf_logs_read_analyst" on db_performance_logs
  for select using (auth.uid() is not null);
