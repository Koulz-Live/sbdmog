// apps/web/src/pages/AuditLogs.tsx
// Enterprise-grade audit log viewer: KPI cards, advanced filters, paginated table,
// expandable detail rows, colour-coded actions, CSV export, auto-refresh.

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '../services/api.js';
import { PageHeader } from '../layout/PageHeader.js';
import { SectionCard } from '../common/SectionCard.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { AuditLog, AuditAction } from '@heqcis/types';

// ── Types ───────────────────────────────────────────────────────────────────
interface Filters {
  action:        string;
  resource_type: string;
  actor_id:      string;
  resource_id:   string;
  severity:      string;
  http_method:   string;
  search:        string;
  date_from:     string;
  date_to:       string;
}

interface ListResponse {
  data:  AuditLog[];
  count: number;
  meta:  { total: number; limit: number; offset: number };
}

// ── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZES = [25, 50, 100];

const ACTION_META: Record<string, { cls: string; icon: string }> = {
  create:           { cls: 'bg-success',            icon: 'bi-plus-circle-fill' },
  update:           { cls: 'bg-warning text-dark',   icon: 'bi-pencil-fill' },
  delete:           { cls: 'bg-danger',              icon: 'bi-trash-fill' },
  approve:          { cls: 'bg-primary',             icon: 'bi-check-circle-fill' },
  reject:           { cls: 'bg-danger',              icon: 'bi-x-circle-fill' },
  publish:          { cls: 'bg-primary',             icon: 'bi-send-fill' },
  view:             { cls: 'bg-secondary',           icon: 'bi-eye-fill' },
  login:            { cls: 'bg-info text-dark',      icon: 'bi-box-arrow-in-right' },
  logout:           { cls: 'bg-dark',                icon: 'bi-box-arrow-right' },
  login_failed:     { cls: 'bg-danger',              icon: 'bi-shield-x' },
  export:           { cls: 'bg-info text-dark',      icon: 'bi-download' },
  upload:           { cls: 'bg-info text-dark',      icon: 'bi-upload' },
  download:         { cls: 'bg-secondary',           icon: 'bi-file-earmark-arrow-down' },
  search:           { cls: 'bg-secondary',           icon: 'bi-search' },
  ai_generate:      { cls: 'bg-purple text-white',   icon: 'bi-stars' },
  ai_analyse:       { cls: 'bg-purple text-white',   icon: 'bi-graph-up' },
  permission_denied:{ cls: 'bg-danger',              icon: 'bi-shield-fill-exclamation' },
  unauthenticated:  { cls: 'bg-danger',              icon: 'bi-lock-fill' },
  role_change:      { cls: 'bg-warning text-dark',   icon: 'bi-person-gear' },
  deactivate:       { cls: 'bg-danger',              icon: 'bi-person-dash-fill' },
  reactivate:       { cls: 'bg-success',             icon: 'bi-person-check-fill' },
  password_reset:   { cls: 'bg-warning text-dark',   icon: 'bi-key-fill' },
  webhook_received: { cls: 'bg-secondary',           icon: 'bi-arrow-repeat' },
  system_error:     { cls: 'bg-danger',              icon: 'bi-exclamation-octagon-fill' },
};

const SEVERITY_META: Record<string, { cls: string }> = {
  info:     { cls: 'bg-secondary' },
  low:      { cls: 'bg-info text-dark' },
  medium:   { cls: 'bg-warning text-dark' },
  high:     { cls: 'bg-danger' },
  critical: { cls: 'bg-danger' },
};

const RESOURCE_ICONS: Record<string, string> = {
  incident:             'bi-exclamation-triangle',
  backup_run:           'bi-cloud-upload',
  etl_run:              'bi-arrow-repeat',
  change_request:       'bi-arrow-left-right',
  monthly_report:       'bi-calendar3',
  security_finding:     'bi-shield-exclamation',
  popia_event:          'bi-person-lock',
  document:             'bi-folder2-open',
  handover_item:        'bi-box-arrow-in-right',
  submission_readiness: 'bi-check2-circle',
  user_session:         'bi-person-badge',
};

const KNOWN_RESOURCE_TYPES = Object.keys(RESOURCE_ICONS).concat([
  'profile', 'report_request', 'maintenance_activity', 'user_session',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildQS(filters: Filters, limit: number, offset: number) {
  const p = new URLSearchParams();
  if (filters.action)        p.set('action',        filters.action);
  if (filters.resource_type) p.set('resource_type', filters.resource_type);
  if (filters.actor_id)      p.set('actor_id',      filters.actor_id);
  if (filters.resource_id)   p.set('resource_id',   filters.resource_id);
  if (filters.severity)      p.set('severity',      filters.severity);
  if (filters.http_method)   p.set('http_method',   filters.http_method);
  if (filters.search)        p.set('search',        filters.search);
  if (filters.date_from)     p.set('date_from',     filters.date_from);
  if (filters.date_to)       p.set('date_to',       filters.date_to);
  p.set('limit',  String(limit));
  p.set('offset', String(offset));
  return p.toString() ? `?${p.toString()}` : '';
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { cls: 'bg-secondary', icon: 'bi-question-circle' };
  return (
    <span className={`badge ${meta.cls} d-inline-flex align-items-center gap-1`} style={{ fontSize: '0.72rem' }}>
      <i className={`bi ${meta.icon}`} style={{ fontSize: '0.65rem' }} />
      {action}
    </span>
  );
}

function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity) return null;
  const meta = SEVERITY_META[severity] ?? { cls: 'bg-secondary' };
  return (
    <span className={`badge ${meta.cls}`} style={{ fontSize: '0.65rem' }}>
      {severity}
    </span>
  );
}

function ResourceBadge({ type }: { type: string }) {
  const icon = RESOURCE_ICONS[type] ?? 'bi-box';
  return (
    <span className="badge bg-light text-secondary border d-inline-flex align-items-center gap-1" style={{ fontSize: '0.72rem' }}>
      <i className={`bi ${icon}`} style={{ fontSize: '0.65rem' }} />
      {type.replace(/_/g, ' ')}
    </span>
  );
}

function KpiCard({ icon, label, value, colour }: { icon: string; label: string; value: string | number; colour: string }) {
  return (
    <div className="col-6 col-lg-3">
      <div className={`card shadow-sm border-0 border-start border-${colour} border-3`}>
        <div className="card-body py-3">
          <div className="d-flex align-items-center gap-3">
            <div className={`rounded-circle bg-${colour} bg-opacity-10 d-flex align-items-center justify-content-center flex-shrink-0`}
              style={{ width: 40, height: 40 }}>
              <i className={`bi ${icon} text-${colour}`} style={{ fontSize: '1.1rem' }} />
            </div>
            <div>
              <div className="fw-bold fs-5 lh-1">{value}</div>
              <div className="text-muted small">{label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="badge bg-primary-subtle text-primary border border-primary border-opacity-25 d-inline-flex align-items-center gap-1 fw-normal">
      {label}
      <button type="button" className="btn-close btn-close-sm ms-1" style={{ fontSize: '0.55rem' }} onClick={onRemove} />
    </span>
  );
}

function DetailRow({ log }: { log: AuditLog }) {
  return (
    <tr className="table-active">
      <td colSpan={8} className="px-4 py-3 bg-light border-start border-4 border-primary">
        <div className="row g-3">
          <div className="col-md-6">
            <table className="table table-sm table-borderless mb-0 small">
              <tbody>
                <tr>
                  <th className="text-muted pe-3 fw-semibold" style={{ width: 130, whiteSpace: 'nowrap' }}>Log ID</th>
                  <td><code className="text-secondary">{log.id}</code></td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">Request ID</th>
                  <td><code className="text-secondary">{log.request_id ?? '—'}</code></td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">Actor ID</th>
                  <td><code className="text-secondary">{log.actor_id ?? '—'}</code></td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">Resource ID</th>
                  <td><code className="text-secondary">{log.resource_id ?? '—'}</code></td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">Severity</th>
                  <td><SeverityBadge severity={log.severity} /></td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">HTTP</th>
                  <td>
                    {log.http_method && (
                      <code className="text-secondary me-2">{log.http_method} {log.http_path}</code>
                    )}
                    {log.http_status && (
                      <span className={`badge ${log.http_status >= 400 ? 'bg-danger' : 'bg-success'}`}>{log.http_status}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">Duration</th>
                  <td>{log.duration_ms != null ? `${log.duration_ms} ms` : '—'}</td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">IP Address</th>
                  <td>{log.ip_address ?? '—'}</td>
                </tr>
                <tr>
                  <th className="text-muted pe-3 fw-semibold">User Agent</th>
                  <td className="text-truncate" style={{ maxWidth: 280 }} title={log.user_agent ?? ''}>
                    {log.user_agent ?? '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="col-md-6">
            <div className="fw-semibold text-muted small mb-1">Metadata</div>
            {log.metadata ? (
              <pre className="bg-white border rounded p-2 small mb-0" style={{ maxHeight: 140, overflowY: 'auto', fontSize: '0.75rem' }}>
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            ) : (
              <span className="text-muted small">No metadata</span>
            )}
            {log.changes && (
              <>
                <div className="fw-semibold text-muted small mt-2 mb-1">Changes (before → after)</div>
                <pre className="bg-white border rounded p-2 small mb-0" style={{ maxHeight: 140, overflowY: 'auto', fontSize: '0.75rem' }}>
                  {JSON.stringify(log.changes, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const BLANK_FILTERS: Filters = { action: '', resource_type: '', actor_id: '', resource_id: '', severity: '', http_method: '', search: '', date_from: '', date_to: '' };

export function AuditLogs() {
  const [filters, setFilters]     = useState<Filters>(BLANK_FILTERS);
  const [draft, setDraft]         = useState<Filters>(BLANK_FILTERS);
  const [pageSize, setPageSize]   = useState(50);
  const [page, setPage]           = useState(0);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiAnalysis,  setAiAnalysis]  = useState<string | null>(null);
  const [aiError,     setAiError]     = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const offset = page * pageSize;
  const qs = buildQS(filters, pageSize, offset);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['auditLogs', qs],
    queryFn:  () => apiGet<ListResponse>(`/audit-logs${qs}`),
    staleTime: 30_000,
  });

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => refetch(), 30_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refetch]);

  const logs  = data?.data  ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Stats from dedicated endpoint (last 24h)
  const { data: statsData } = useQuery({
    queryKey: ['auditStats'],
    queryFn:  () => apiGet<{ data: { security_events: number; by_action: Record<string, number>; by_severity: Record<string, number>; unique_actors: number } }>('/audit-logs/stats?days=1'),
    staleTime: 60_000,
  });
  const stats = statsData?.data;

  // KPI derivations (page-level)
  const uniqueActors    = stats?.unique_actors ?? new Set(logs.map((l) => l.actor_id).filter(Boolean)).size;
  const actionCounts    = logs.reduce<Record<string, number>>((acc, l) => { acc[l.action] = (acc[l.action] ?? 0) + 1; return acc; }, {});
  const loginCount      = stats?.by_action?.['login']        ?? actionCounts['login']        ?? 0;
  const loginFailCount  = stats?.by_action?.['login_failed'] ?? actionCounts['login_failed'] ?? 0;
  void loginFailCount; // available for future use
  const securityEvents  = stats?.security_events ?? 0;

  function applyFilters() { setFilters({ ...draft }); setPage(0); }
  function clearFilters() { setFilters(BLANK_FILTERS); setDraft(BLANK_FILTERS); setPage(0); }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const activeFilterChips = Object.entries(filters)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => ({ key: k, label: `${k.replace(/_/g, ' ')}: ${v}` }));

  function handleExport() {
    const exportQS = buildQS(filters, 10000, 0);
    window.open(`/api/audit-logs/export${exportQS}`, '_blank');
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle={`${total.toLocaleString()} entries${filters !== BLANK_FILTERS && JSON.stringify(filters) !== JSON.stringify(BLANK_FILTERS) ? ' (filtered)' : ''}`}
        actions={
          <div className="d-flex gap-2">
            <button
              className={`btn btn-sm ${autoRefresh ? 'btn-success' : 'btn-outline-secondary'}`}
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
            >
              <i className={`bi bi-arrow-clockwise${autoRefresh ? ' me-1' : ''}`} />
              {autoRefresh && <span>Live</span>}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()} disabled={isFetching}>
              <i className="bi bi-arrow-clockwise" />
            </button>
            <button className="btn btn-sm btn-outline-primary" onClick={handleExport}>
              <i className="bi bi-download me-1" />CSV Export
            </button>
            <button
              className="btn btn-sm btn-outline-info"
              disabled={aiLoading}
              onClick={async () => {
                setAiLoading(true); setAiError(null);
                try {
                  const res = await apiPost<{ data: { analysis: string; model: string; entries_analysed: number } }>('/audit-logs/ai-analyse', { days: 7 });
                  setAiAnalysis(res.data.analysis);
                  setShowAnalysis(true);
                } catch (e: any) {
                  setAiError(e?.message ?? 'AI analysis failed.');
                } finally {
                  setAiLoading(false);
                }
              }}
            >
              {aiLoading
                ? <><span className="spinner-border spinner-border-sm me-1" />Analysing…</>
                : <><i className="bi bi-stars me-1" />AI Analyse</>}
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <KpiCard icon="bi-journal-text"       label="Total (24h)"       value={total}          colour="primary" />
        <KpiCard icon="bi-people"             label="Unique actors (24h)" value={uniqueActors} colour="info" />
        <KpiCard icon="bi-box-arrow-in-right" label="Logins (24h)"      value={loginCount}     colour="success" />
        <KpiCard icon="bi-shield-exclamation" label="Risk events (24h)" value={securityEvents}  colour="danger" />
      </div>

      {/* AI Analysis panel */}
      {aiError && (
        <div className="alert alert-danger alert-dismissible py-2 mb-3" role="alert">
          <i className="bi bi-exclamation-triangle me-2" />{aiError}
          <button type="button" className="btn-close" onClick={() => setAiError(null)} />
        </div>
      )}
      {showAnalysis && aiAnalysis && (
        <SectionCard
          title="AI Governance Analysis"
          className="mb-3 border-info"
          action={
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowAnalysis(false)}>
              <i className="bi bi-x" /> Dismiss
            </button>
          }
        >
          <div className="text-muted small mb-2">
            <i className="bi bi-stars me-1 text-info" />Analysis of the last 7 days of audit activity
          </div>
          <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.7 }}>
            {aiAnalysis}
          </pre>
        </SectionCard>
      )}

      {/* Filter panel */}
      <SectionCard
        title="Filters"
        action={
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={applyFilters}>Apply</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>Clear</button>
          </div>
        }
        className="mb-3"
      >
        <div className="row g-2">
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">Action</label>
            <select className="form-select form-select-sm" value={draft.action}
              onChange={(e) => setDraft((f) => ({ ...f, action: e.target.value }))}>
              <option value="">All actions</option>
              {Object.keys(ACTION_META).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">Resource Type</label>
            <select className="form-select form-select-sm" value={draft.resource_type}
              onChange={(e) => setDraft((f) => ({ ...f, resource_type: e.target.value }))}>
              <option value="">All types</option>
              {KNOWN_RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">Date From</label>
            <input type="date" className="form-control form-control-sm" value={draft.date_from}
              onChange={(e) => setDraft((f) => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">Date To</label>
            <input type="date" className="form-control form-control-sm" value={draft.date_to}
              onChange={(e) => setDraft((f) => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div className="col-6 col-md-6">
            <label className="form-label small fw-semibold mb-1">Actor ID</label>
            <input type="text" className="form-control form-control-sm" placeholder="UUID…" value={draft.actor_id}
              onChange={(e) => setDraft((f) => ({ ...f, actor_id: e.target.value }))} />
          </div>
          <div className="col-6 col-md-6">
            <label className="form-label small fw-semibold mb-1">Resource ID</label>
            <input type="text" className="form-control form-control-sm" placeholder="UUID…" value={draft.resource_id}
              onChange={(e) => setDraft((f) => ({ ...f, resource_id: e.target.value }))} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">Severity</label>
            <select className="form-select form-select-sm" value={draft.severity}
              onChange={(e) => setDraft((f) => ({ ...f, severity: e.target.value }))}>
              <option value="">All severities</option>
              {(['critical','high','medium','low','info'] as const).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold mb-1">HTTP Method</label>
            <select className="form-select form-select-sm" value={draft.http_method}
              onChange={(e) => setDraft((f) => ({ ...f, http_method: e.target.value }))}>
              <option value="">All methods</option>
              {['GET','POST','PATCH','PUT','DELETE'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold mb-1">Search</label>
            <input type="text" className="form-control form-control-sm" placeholder="Action, resource type, path…" value={draft.search}
              onChange={(e) => setDraft((f) => ({ ...f, search: e.target.value }))} />
          </div>
        </div>
      </SectionCard>

      {/* Active filter chips */}
      {activeFilterChips.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className="small text-muted align-self-center">Active filters:</span>
          {activeFilterChips.map(({ key, label }) => (
            <FilterChip key={key} label={label}
              onRemove={() => {
                const next = { ...filters, [key]: '' };
                setFilters(next);
                setDraft(next);
                setPage(0);
              }}
            />
          ))}
        </div>
      )}

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}

      {!isLoading && !error && logs.length === 0 && (
        <EmptyState icon="bi-journal-text" title="No entries on record"
          message="Adjust your filters or wait for system activity to be recorded." />
      )}

      {logs.length > 0 && (
        <>
          {/* Table */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-header bg-white d-flex align-items-center justify-content-between py-2 px-3">
              <span className="small text-muted fw-semibold">
                {isFetching && <span className="spinner-border spinner-border-sm me-2" />}
                Showing {offset + 1}–{Math.min(offset + pageSize, total)} of {total.toLocaleString()}
              </span>
              <div className="d-flex align-items-center gap-2">
                <label className="small text-muted mb-0">Per page:</label>
                <select className="form-select form-select-sm" style={{ width: 80 }}
                  value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th style={{ width: 170 }}>Timestamp</th>
                    <th style={{ width: 110 }}>Action</th>
                    <th style={{ width: 90 }}>Severity</th>
                    <th>Resource Type</th>
                    <th style={{ width: 130 }}>Actor</th>
                    <th style={{ width: 130 }}>Resource ID</th>
                    <th style={{ width: 90 }}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleExpanded(log.id)}
                        style={{ cursor: 'pointer' }}
                        className={
                          expanded.has(log.id) ? 'table-primary' :
                          log.severity === 'critical' ? 'table-danger' :
                          log.severity === 'high' ? 'table-warning' : ''
                        }
                      >
                        <td className="text-muted small text-center">
                          <i className={`bi bi-chevron-${expanded.has(log.id) ? 'down' : 'right'}`} />
                        </td>
                        <td className="small text-nowrap text-muted">
                          {new Date(log.created_at).toLocaleString('en-ZA', {
                            year: '2-digit', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                          })}
                        </td>
                        <td><ActionBadge action={log.action} /></td>
                        <td><SeverityBadge severity={log.severity} /></td>
                        <td><ResourceBadge type={log.resource_type} /></td>
                        <td className="small"><code className="text-secondary small">{log.actor_id ? log.actor_id.slice(0, 8) + '…' : '—'}</code></td>
                        <td className="small"><code className="text-secondary small">{log.resource_id ? log.resource_id.slice(0, 8) + '…' : '—'}</code></td>
                        <td className="small text-muted">{log.ip_address ?? '—'}</td>
                      </tr>
                      {expanded.has(log.id) && <DetailRow log={log} />}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="d-flex justify-content-center">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${page === 0 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage(0)}><i className="bi bi-chevron-double-left" /></button>
                </li>
                <li className={`page-item ${page === 0 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage((p) => p - 1)}><i className="bi bi-chevron-left" /></button>
                </li>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const start = Math.max(0, Math.min(page - 3, totalPages - 7));
                  const p = start + i;
                  return (
                    <li key={p} className={`page-item ${p === page ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => setPage(p)}>{p + 1}</button>
                    </li>
                  );
                })}
                <li className={`page-item ${page >= totalPages - 1 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage((p) => p + 1)}><i className="bi bi-chevron-right" /></button>
                </li>
                <li className={`page-item ${page >= totalPages - 1 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => setPage(totalPages - 1)}><i className="bi bi-chevron-double-right" /></button>
                </li>
              </ul>
            </nav>
          )}

          <p className="text-center text-muted small mt-2">
            Page {page + 1} of {totalPages} · {total.toLocaleString()} total entries
          </p>
        </>
      )}
    </div>
  );
}
