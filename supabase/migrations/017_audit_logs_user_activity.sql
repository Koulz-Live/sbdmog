-- 017_audit_logs_user_activity.sql
-- Extends the audit_logs action CHECK to include user session activity events.
-- Adds a dedicated index for quick session event lookups.

-- Drop the existing action CHECK constraint and replace with an extended one
-- that covers user activity events: login, logout, login_failed.
alter table audit_logs
  drop constraint if exists audit_logs_action_check;

alter table audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'create', 'update', 'delete', 'approve', 'view',
    'login', 'logout', 'login_failed'
  ));

-- Index for user_session resource queries (security dashboards, failed logins)
create index if not exists audit_logs_user_session_idx
  on audit_logs(resource_type, action, created_at desc)
  where resource_type = 'user_session';
