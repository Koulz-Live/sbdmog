-- 019_sql_connections.sql
-- Stores named SQL Server connection profiles.
-- Supports both Azure SQL (encrypt=true) and on-premises Windows SQL Server
-- (Windows Auth via trusted connection or SQL Auth).
-- Passwords are NEVER stored in plaintext — only a reference key is stored
-- and the real secret is resolved from Supabase Vault or environment at runtime.
-- Only admin users can manage connection records.

create table if not exists sql_connections (
  id                uuid          primary key default gen_random_uuid(),

  -- Display
  label             text          not null,                          -- e.g. "Azure SQL — Production"
  description       text,

  -- Connection type
  connection_type   text          not null
    check (connection_type in ('azure_sql', 'windows_sql')),

  -- Network
  server            text          not null,                          -- hostname or IP
  port              integer       not null default 1433,
  database_name     text          not null,

  -- Authentication
  auth_type         text          not null default 'sql_auth'
    check (auth_type in ('sql_auth', 'windows_auth', 'managed_identity')),
  username          text,                                            -- null for windows_auth / managed_identity

  -- Secret reference — the actual password/secret is stored in Supabase Vault
  -- or injected via env. This column holds the vault secret name or env var key.
  secret_ref        text,                                            -- e.g. "SQL_CONN_PROD_PASSWORD"

  -- TLS / trust options
  encrypt           boolean       not null default true,
  trust_server_certificate boolean not null default false,

  -- Timeouts (ms)
  connect_timeout_ms  integer     not null default 15000,
  request_timeout_ms  integer     not null default 30000,

  -- Metadata
  is_default        boolean       not null default false,
  is_active         boolean       not null default true,
  last_tested_at    timestamptz,
  last_test_status  text
    check (last_test_status in ('success', 'failed', null)),
  last_test_message text,

  created_by        uuid          references profiles(id) on delete set null,
  updated_by        uuid          references profiles(id) on delete set null,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- Only one default per connection_type at a time
create unique index if not exists sql_connections_default_idx
  on sql_connections (connection_type)
  where is_default = true;

-- Performance
create index if not exists sql_connections_type_idx on sql_connections(connection_type);
create index if not exists sql_connections_active_idx on sql_connections(is_active);

-- Updated-at trigger
create or replace function set_sql_connections_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sql_connections_updated_at on sql_connections;
create trigger sql_connections_updated_at
  before update on sql_connections
  for each row execute function set_sql_connections_updated_at();

-- RLS
alter table sql_connections enable row level security;

-- Admins full access
create policy "sql_connections_admin_all" on sql_connections
  for all using (is_admin());

-- Authenticated users can read active connections (needed to pick target during ETL push)
create policy "sql_connections_read_active" on sql_connections
  for select using (auth.uid() is not null and is_active = true);
