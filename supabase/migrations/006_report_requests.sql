-- 006_report_requests.sql

create table if not exists report_requests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  requester_id  uuid references profiles(id) on delete set null,
  assigned_to   uuid references profiles(id) on delete set null,
  priority      text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status        text not null default 'submitted' check (status in ('submitted','in_progress','delivered','closed')),
  due_date      date,
  delivery_url  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table report_requests enable row level security;

create policy "report_requests_select_auth" on report_requests
  for select using (auth.role() = 'authenticated');

create policy "report_requests_insert" on report_requests
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );

create policy "report_requests_update" on report_requests
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger report_requests_updated_at
  before update on report_requests
  for each row execute function update_updated_at_column();
