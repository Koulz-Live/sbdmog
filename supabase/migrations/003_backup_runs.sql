-- 003_backup_runs.sql
-- Backup run history — manual or webhook-ingested

create table if not exists backup_runs (
  id                      uuid primary key default gen_random_uuid(),
  source                  text not null default 'manual' check (source in ('webhook','manual')),
  database_name           text not null,
  backup_type             text not null check (backup_type in ('full','differential','log')),
  status                  text not null check (status in ('success','failed','running','skipped')),
  started_at              timestamptz,
  finished_at             timestamptz,
  size_bytes              bigint,
  disk_free_bytes_before  bigint,
  disk_free_bytes_after   bigint,
  backup_path             text,
  error_message           text,
  remediation_note        text,
  created_at              timestamptz not null default now()
);

create index if not exists backup_runs_status_idx     on backup_runs(status);
create index if not exists backup_runs_created_at_idx on backup_runs(created_at desc);
create index if not exists backup_runs_database_idx   on backup_runs(database_name);

alter table backup_runs enable row level security;

create policy "backup_runs_select_auth" on backup_runs
  for select using (auth.role() = 'authenticated');

create policy "backup_runs_insert" on backup_runs
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "backup_runs_update" on backup_runs
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
