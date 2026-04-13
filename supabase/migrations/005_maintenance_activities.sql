-- 005_maintenance_activities.sql

create table if not exists maintenance_activities (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  activity_type text not null check (activity_type in ('scheduled','emergency','patch','upgrade','audit')),
  status        text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  system_target text,
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  performed_by  uuid references profiles(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists maint_status_idx     on maintenance_activities(status);
create index if not exists maint_scheduled_idx  on maintenance_activities(scheduled_at desc);

alter table maintenance_activities enable row level security;

create policy "maint_select_auth" on maintenance_activities
  for select using (auth.role() = 'authenticated');

create policy "maint_insert" on maintenance_activities
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "maint_update" on maintenance_activities
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger maintenance_activities_updated_at
  before update on maintenance_activities
  for each row execute function update_updated_at_column();
