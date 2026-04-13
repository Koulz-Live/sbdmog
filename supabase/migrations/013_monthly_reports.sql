-- 013_monthly_reports.sql
-- Structured 7-section monthly operational reports

create table if not exists monthly_reports (
  id                           uuid primary key default gen_random_uuid(),
  period                       text not null unique,
  status                       text not null default 'draft'
    check (status in ('draft','in_review','approved','published')),
  section_executive_summary    text,
  section_incidents            text,
  section_backup_etl           text,
  section_change_requests      text,
  section_security_popia       text,
  section_submission_readiness text,
  section_upcoming_work        text,
  prepared_by                  uuid references profiles(id) on delete set null,
  approved_by                  uuid references profiles(id) on delete set null,
  approved_at                  timestamptz,
  published_at                 timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table monthly_reports enable row level security;

create policy "monthly_reports_select_auth" on monthly_reports
  for select using (auth.role() = 'authenticated');

create policy "monthly_reports_insert" on monthly_reports
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','analyst'))
  );

create policy "monthly_reports_update" on monthly_reports
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','analyst'))
  );

create trigger monthly_reports_updated_at
  before update on monthly_reports
  for each row execute function update_updated_at_column();
