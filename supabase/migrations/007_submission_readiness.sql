-- 007_submission_readiness.sql
-- SAQA/NLRD/DHET submission readiness checks and validation issues

create table if not exists submission_readiness_checks (
  id              uuid primary key default gen_random_uuid(),
  submission_type text not null check (submission_type in ('SAQA_NLRD','DHET_STATS','HEQF_MAPPING','OTHER')),
  period          text not null,
  overall_status  text not null default 'pending' check (overall_status in ('pending','in_progress','ready','blocked')),
  checked_by      uuid references profiles(id) on delete set null,
  notes           text,
  checked_at      timestamptz default now(),
  created_at      timestamptz not null default now()
);

alter table submission_readiness_checks enable row level security;

create policy "submission_checks_select_auth" on submission_readiness_checks
  for select using (auth.role() = 'authenticated');

create policy "submission_checks_insert" on submission_readiness_checks
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );

create policy "submission_checks_update" on submission_readiness_checks
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

-- Validation issues linked to a readiness check
create table if not exists submission_validation_issues (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid not null references submission_readiness_checks(id) on delete cascade,
  field_name  text not null,
  issue_type  text not null,
  description text,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table submission_validation_issues enable row level security;

create policy "sub_issues_select_auth" on submission_validation_issues
  for select using (auth.role() = 'authenticated');

create policy "sub_issues_insert" on submission_validation_issues
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );

create policy "sub_issues_update" on submission_validation_issues
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
