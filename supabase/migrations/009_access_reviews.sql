-- 009_access_reviews.sql
-- Quarterly access review register (admin-only)

create table if not exists access_reviews (
  id            uuid primary key default gen_random_uuid(),
  period        text not null,
  system_name   text not null,
  reviewed_by   uuid references profiles(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','in_progress','completed')),
  findings      text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table access_reviews enable row level security;

-- Admin-only: all operations
create policy "access_reviews_admin_all" on access_reviews
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
