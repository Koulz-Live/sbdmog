-- 010_popia_events.sql
-- POPIA compliance event register

create table if not exists popia_events (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null check (event_type in ('breach','request','consent','deletion','audit')),
  description      text,
  data_subject     text,
  reported_by      uuid references profiles(id) on delete set null,
  status           text not null default 'open' check (status in ('open','under_review','resolved','closed')),
  resolution_notes text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists popia_status_idx on popia_events(status);

alter table popia_events enable row level security;

create policy "popia_select_auth" on popia_events
  for select using (auth.role() = 'authenticated');

create policy "popia_insert" on popia_events
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "popia_update" on popia_events
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger popia_events_updated_at
  before update on popia_events
  for each row execute function update_updated_at_column();
