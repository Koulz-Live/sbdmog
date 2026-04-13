-- 002_incidents.sql
-- Incident / service issue management

create table if not exists incidents (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,
  title            text not null,
  description      text,
  category         text check (category in ('heqcis_app','database','etl','backup','network','security','other')),
  affected_system  text check (affected_system in ('HEQCIS_WEB','HEQCIS_DB','PENTAHO','OTHER')),
  severity         text not null check (severity in ('P1','P2','P3','P4')),
  status           text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to      uuid references profiles(id) on delete set null,
  reported_by      uuid references profiles(id) on delete set null,
  sla_breach_at    timestamptz,
  ai_summary       text,
  ai_rca_draft     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create index if not exists incidents_status_idx    on incidents(status);
create index if not exists incidents_severity_idx  on incidents(severity);
create index if not exists incidents_created_at_idx on incidents(created_at desc);

alter table incidents enable row level security;

-- Authenticated users can read all incidents
create policy "incidents_select_auth" on incidents
  for select using (auth.role() = 'authenticated');

-- Admins and engineers can insert
create policy "incidents_insert" on incidents
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

-- Admins and engineers can update
create policy "incidents_update" on incidents
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger incidents_updated_at
  before update on incidents
  for each row execute function update_updated_at_column();

-- Incident updates / timeline entries
create table if not exists incident_updates (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists incident_updates_incident_id_idx on incident_updates(incident_id);

alter table incident_updates enable row level security;

create policy "incident_updates_select_auth" on incident_updates
  for select using (auth.role() = 'authenticated');

create policy "incident_updates_insert" on incident_updates
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
