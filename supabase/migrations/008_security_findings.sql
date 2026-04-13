-- 008_security_findings.sql

create table if not exists security_findings (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text,
  severity                text not null check (severity in ('critical','high','medium','low','info')),
  status                  text not null default 'open'
    check (status in ('open','in_remediation','remediated','accepted','false_positive')),
  source                  text check (source in ('scan','audit','manual','siem')),
  affected_system         text,
  assigned_to             uuid references profiles(id) on delete set null,
  ai_remediation_guidance text,
  due_date                date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists security_severity_idx on security_findings(severity);
create index if not exists security_status_idx   on security_findings(status);

alter table security_findings enable row level security;

create policy "security_select_auth" on security_findings
  for select using (auth.role() = 'authenticated');

create policy "security_insert" on security_findings
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "security_update" on security_findings
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger security_findings_updated_at
  before update on security_findings
  for each row execute function update_updated_at_column();
