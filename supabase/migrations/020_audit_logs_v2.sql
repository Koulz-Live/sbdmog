-- 019_audit_logs_v2.sql
-- Enterprise-grade audit log enhancements.
-- Adds: severity, changes (before/after diff), http context, timing, request correlation.
-- Extends the action CHECK to cover all system event types.
-- Append-only integrity is preserved — no update/delete policies are added.

-- ── 1. Extend the action CHECK constraint ────────────────────────────────────
alter table audit_logs
  drop constraint if exists audit_logs_action_check;

alter table audit_logs
  add constraint audit_logs_action_check
  check (action in (
    -- CRUD
    'create', 'update', 'delete',
    -- Workflow
    'approve', 'reject', 'publish',
    -- Access / sessions
    'view', 'login', 'logout', 'login_failed',
    -- Data operations
    'export', 'upload', 'download', 'search',
    -- AI operations
    'ai_generate', 'ai_analyse',
    -- Security events
    'permission_denied', 'unauthenticated',
    -- Administrative
    'role_change', 'deactivate', 'reactivate', 'password_reset',
    -- System / automation
    'webhook_received', 'system_error'
  ));

-- ── 2. New columns ────────────────────────────────────────────────────────────

-- Severity classification of the event (info → critical)
alter table audit_logs
  add column if not exists severity text not null default 'info'
  check (severity in ('info', 'low', 'medium', 'high', 'critical'));

-- Before/after diff for update operations
alter table audit_logs
  add column if not exists changes jsonb;

-- HTTP request context
alter table audit_logs
  add column if not exists http_method text;

alter table audit_logs
  add column if not exists http_path text;

alter table audit_logs
  add column if not exists http_status integer;

-- Request duration for performance tracking
alter table audit_logs
  add column if not exists duration_ms integer;

-- Correlation ID — matches X-Request-ID header in responses
alter table audit_logs
  add column if not exists request_id uuid;

-- ── 3. Additional indexes ─────────────────────────────────────────────────────

-- Fast lookup by severity for risk dashboards
create index if not exists audit_logs_severity_idx
  on audit_logs(severity, created_at desc)
  where severity in ('high', 'critical');

-- Fast lookup by action type
create index if not exists audit_logs_action_idx
  on audit_logs(action, created_at desc);

-- Correlation by request_id
create index if not exists audit_logs_request_id_idx
  on audit_logs(request_id)
  where request_id is not null;

-- HTTP path pattern lookups
create index if not exists audit_logs_http_path_idx
  on audit_logs(http_path, created_at desc)
  where http_path is not null;

-- Security: failed access attempts
create index if not exists audit_logs_security_events_idx
  on audit_logs(action, created_at desc)
  where action in ('permission_denied', 'unauthenticated', 'login_failed', 'system_error');
