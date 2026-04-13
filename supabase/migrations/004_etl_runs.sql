-- 004_etl_runs.sql
-- ETL run history for HEQCISWEB_Job and other pipelines

create table if not exists etl_runs (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null default 'manual' check (source in ('webhook','manual')),
  job_name              text not null,
  pipeline_name         text,
  status                text not null check (status in ('success','failed','partial','running')),
  rows_processed        integer,
  rows_failed           integer,
  started_at            timestamptz,
  finished_at           timestamptz,
  error_message         text,
  restart_required      boolean not null default false,
  restart_completed_at  timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists etl_runs_status_idx     on etl_runs(status);
create index if not exists etl_runs_created_at_idx on etl_runs(created_at desc);
create index if not exists etl_runs_job_name_idx   on etl_runs(job_name);

alter table etl_runs enable row level security;

create policy "etl_runs_select_auth" on etl_runs
  for select using (auth.role() = 'authenticated');

create policy "etl_runs_insert" on etl_runs
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "etl_runs_update" on etl_runs
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
