-- supabase/migrations/023_db_index_logs.sql
-- Database Index Maintenance Logs
-- Stores daily auto-logged index fragmentation snapshots and
-- rebuild/reorganise task results for the HEQCIS SQL Server database.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
create table if not exists db_index_logs (
  id               uuid        primary key default gen_random_uuid(),

  checked_at       timestamptz not null default now(),
  status           text        not null default 'healthy'
    check (status in ('healthy', 'warnings', 'critical', 'unreachable', 'unknown')),
  duration_ms      integer     not null default 0,
  environment      text        not null default 'production',

  -- Per-index fragmentation snapshot
  index_stats      jsonb,
  -- e.g. [{ table_name, index_name, index_type, fragmentation_pct, page_count, action_taken }]
  -- action_taken: 'none' | 'reorganize' | 'rebuild' | 'skipped'

  -- Summary counts
  total_indexes    integer default 0,
  healthy_count    integer default 0,   -- frag < 10%
  reorganized_count integer default 0,  -- frag 10–30%
  rebuilt_count    integer default 0,   -- frag > 30%
  skipped_count    integer default 0,   -- page_count too small

  -- Worst offenders (top 5 by fragmentation)
  top_fragmented   jsonb,

  -- Average fragmentation across all indexes
  avg_fragmentation_pct numeric(5,2),

  -- Missing index recommendations from DMV
  missing_indexes  jsonb,
  -- e.g. [{ table_name, impact_score, equality_columns, inequality_columns, included_columns }]

  details          jsonb,
  error_message    text,

  -- AI analysis
  ai_summary       text,
  ai_actions       jsonb,
  ai_severity      text
    check (ai_severity is null or ai_severity in ('low','medium','high','critical')),
  ai_generated_at  timestamptz,

  created_at       timestamptz not null default now()
);

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
create index if not exists db_index_logs_checked_at_idx on db_index_logs(checked_at desc);
create index if not exists db_index_logs_status_idx     on db_index_logs(status, checked_at desc);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
alter table db_index_logs enable row level security;

create policy "db_index_logs_read_auth" on db_index_logs
  for select using (auth.uid() is not null);

create policy "db_index_logs_admin_write" on db_index_logs
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin','engineer'))
  );
