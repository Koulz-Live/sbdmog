-- 001_profiles.sql
-- User profiles table linked to Supabase Auth

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  role         text not null default 'viewer'
                 check (role in ('admin','engineer','analyst','viewer')),
  department   text,
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

-- Users can update their own profile
create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

-- Helper: check if current user is admin (security definer avoids RLS recursion)
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Admins can read all profiles (uses security definer fn to avoid self-referential RLS loop)
create policy "profiles_select_admin" on profiles
  for select using (is_admin());

-- Trigger: keep updated_at current
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at_column();
