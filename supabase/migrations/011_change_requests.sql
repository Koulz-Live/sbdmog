-- 011_change_requests.sql
-- Formal change governance with approval workflow

create table if not exists change_requests (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique not null,
  title              text not null,
  description        text,
  type               text not null check (type in ('standard','emergency','normal')),
  risk_level         text check (risk_level in ('low','medium','high','critical')),
  status             text not null default 'draft'
    check (status in ('draft','submitted','under_review','approved','rejected','implemented','closed')),
  requested_by       uuid references profiles(id) on delete set null,
  scheduled_date     timestamptz,
  implemented_at     timestamptz,
  rollback_plan      text,
  testing_notes      text,
  ai_risk_assessment text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists cr_status_idx     on change_requests(status);
create index if not exists cr_created_at_idx on change_requests(created_at desc);

alter table change_requests enable row level security;

create policy "cr_select_auth" on change_requests
  for select using (auth.role() = 'authenticated');

create policy "cr_insert" on change_requests
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "cr_update" on change_requests
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger change_requests_updated_at
  before update on change_requests
  for each row execute function update_updated_at_column();

-- Approval decisions linked to a change request
create table if not exists change_request_approvals (
  id                 uuid primary key default gen_random_uuid(),
  change_request_id  uuid not null references change_requests(id) on delete cascade,
  approver_id        uuid references profiles(id) on delete set null,
  decision           text not null check (decision in ('approved','rejected','abstained')),
  comments           text,
  decided_at         timestamptz not null default now()
);

alter table change_request_approvals enable row level security;

create policy "cr_approvals_select_auth" on change_request_approvals
  for select using (auth.role() = 'authenticated');

create policy "cr_approvals_insert" on change_request_approvals
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
