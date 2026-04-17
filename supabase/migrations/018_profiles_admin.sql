-- 018_profiles_admin.sql
-- Extends profiles table for enterprise user management:
--   • is_active flag for soft-deactivation
--   • Admin RLS policies for full CRUD
--   • last_login_at for session tracking

alter table profiles
  add column if not exists is_active     boolean      not null default true,
  add column if not exists last_login_at timestamptz,
  add column if not exists invited_by    uuid references profiles(id) on delete set null;

-- Index for quick active-user queries
create index if not exists profiles_is_active_idx on profiles(is_active);
create index if not exists profiles_role_idx       on profiles(role);

-- Admins can update any profile (role, department, is_active, etc.)
create policy "profiles_update_admin" on profiles
  for update using (is_admin());

-- Admins can insert new profiles (needed when inviting users server-side)
create policy "profiles_insert_admin" on profiles
  for insert with check (is_admin());
