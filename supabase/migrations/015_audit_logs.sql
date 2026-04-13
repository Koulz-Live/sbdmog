-- 015_audit_logs.sql
-- Append-only immutable audit trail for all system actions.
-- CRITICAL: No UPDATE or DELETE policies — records are permanent.

create table if not exists audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles(id) on delete set null,
  action        text not null
    check (action in ('create','update','delete','approve','view')),
  resource_type text not null,
  resource_id   uuid,
  metadata      jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- index for common access patterns
create index if not exists audit_logs_actor_idx        on audit_logs(actor_id);
create index if not exists audit_logs_resource_idx     on audit_logs(resource_type, resource_id);
create index if not exists audit_logs_created_at_idx   on audit_logs(created_at desc);

alter table audit_logs enable row level security;

-- only admins can read the audit trail
create policy "audit_logs_select_admin" on audit_logs
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- server-side service role can always insert (check true allows any row)
create policy "audit_logs_insert_server" on audit_logs
  for insert with check (true);

-- intentionally NO update or delete policies — append-only by design
