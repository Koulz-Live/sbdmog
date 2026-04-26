-- supabase/migrations/022_db_integrity_logs.sql
-- Database Integrity & Data Integrity Check Logs
-- Two tables:
--   db_integrity_logs  — structural integrity (DBCC CHECKDB equivalent queries)
--   db_data_integrity_logs — data-level quality checks (nulls, orphans, ref integrity)

-- ── 1. Structural Integrity Table ────────────────────────────────────────────
create table if not exists db_integrity_logs (
  id              uuid        primary key default gen_random_uuid(),

  checked_at      timestamptz not null default now(),
  status          text        not null default 'passed'
    check (status in ('passed', 'warnings', 'errors', 'unreachable', 'unknown')),
  duration_ms     integer     not null default 0,
  environment     text        not null default 'production',

  -- DBCC CHECKDB equivalent: object-level checks
  object_checks   jsonb,
  -- e.g. [{ object_name, error_count, warning_count, last_known_clean_at }]

  -- Allocation errors
  allocation_errors   integer default 0,
  consistency_errors  integer default 0,

  -- Page / row counts at time of check
  page_count      bigint,
  row_count_check jsonb,
  -- e.g. [{ table_name, row_count, expected_range_min, expected_range_max, is_anomalous }]

  -- Transaction log health
  log_space_used_pct  numeric(5,2),
  log_reuse_wait      text,

  -- Orphaned objects / constraints
  disabled_constraints jsonb,
  -- e.g. [{ table_name, constraint_name, type }]

  details         jsonb,
  error_message   text,

  -- AI analysis
  ai_summary      text,
  ai_actions      jsonb,
  ai_severity     text
    check (ai_severity is null or ai_severity in ('low','medium','high','critical')),
  ai_generated_at timestamptz,

  created_at      timestamptz not null default now()
);

create index if not exists db_integrity_logs_checked_at_idx on db_integrity_logs(checked_at desc);
create index if not exists db_integrity_logs_status_idx     on db_integrity_logs(status, checked_at desc);

alter table db_integrity_logs enable row level security;

create policy "db_integrity_logs_read_auth" on db_integrity_logs
  for select using (auth.uid() is not null);

create policy "db_integrity_logs_admin_write" on db_integrity_logs
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','engineer'))
  );

-- ── 2. Data Integrity Table ───────────────────────────────────────────────────
create table if not exists db_data_integrity_logs (
  id              uuid        primary key default gen_random_uuid(),

  checked_at      timestamptz not null default now(),
  status          text        not null default 'passed'
    check (status in ('passed', 'warnings', 'errors', 'unreachable', 'unknown')),
  duration_ms     integer     not null default 0,
  environment     text        not null default 'production',

  -- Null/missing required fields
  null_checks     jsonb,
  -- e.g. [{ table_name, column_name, null_count, severity }]

  -- Referential integrity violations (FK violations that SQL Server allows)
  ref_violations  jsonb,
  -- e.g. [{ parent_table, child_table, orphan_count }]

  -- Duplicate key / uniqueness checks
  duplicate_checks jsonb,
  -- e.g. [{ table_name, column_name, duplicate_count }]

  -- Date/range anomalies
  range_checks    jsonb,
  -- e.g. [{ table_name, column_name, anomaly_type, anomaly_count }]

  -- Row counts per table (for trending)
  table_row_counts jsonb,
  -- e.g. [{ table_name, row_count, prev_count, delta_pct }]

  -- Total anomaly count
  total_issues    integer default 0,

  details         jsonb,
  error_message   text,

  -- AI analysis
  ai_summary      text,
  ai_actions      jsonb,
  ai_severity     text
    check (ai_severity is null or ai_severity in ('low','medium','high','critical')),
  ai_generated_at timestamptz,

  created_at      timestamptz not null default now()
);

create index if not exists db_data_integrity_logs_checked_at_idx on db_data_integrity_logs(checked_at desc);
create index if not exists db_data_integrity_logs_status_idx     on db_data_integrity_logs(status, checked_at desc);

alter table db_data_integrity_logs enable row level security;

create policy "db_data_integrity_logs_read_auth" on db_data_integrity_logs
  for select using (auth.uid() is not null);

create policy "db_data_integrity_logs_admin_write" on db_data_integrity_logs
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','engineer'))
  );
