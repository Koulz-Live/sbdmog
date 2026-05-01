// apps/web/src/pages/DbMonitoring.tsx
// Database Monitoring Dashboard
// Four tabs: Performance | DB Integrity | Data Integrity | Index Maintenance
// Each tab shows: KPI cards, trend chart, recent run table, and AI analysis panel.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../services/api.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import type {
  DbPerformanceLog, DbIntegrityLog, DbDataIntegrityLog, DbIndexLog,
} from '@heqcis/types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ListResp<T> { data: T[]; count: number; }
interface SummaryResp {
  performance:    { latest: DbPerformanceLog | null; history: DbPerformanceLog[]; critical_count: number };
  integrity:      { latest: DbIntegrityLog | null;   history: DbIntegrityLog[];   error_count: number };
  data_integrity: { latest: DbDataIntegrityLog | null; history: DbDataIntegrityLog[]; issue_count: number };
  index:          { latest: DbIndexLog | null;        history: DbIndexLog[];        rebuild_total: number };
}
interface AiResp { summary: string; actions: string[]; severity: string }

type TabId = 'performance' | 'integrity' | 'data-integrity' | 'index';

// ── Status helpers ─────────────────────────────────────────────────────────────
function statusColor(status: string): string {
  switch (status) {
    case 'healthy': case 'passed':   return 'success';
    case 'degraded': case 'warnings': return 'warning';
    case 'critical': case 'errors':   return 'danger';
    case 'unreachable':               return 'danger';
    default:                          return 'secondary';
  }
}
function severityColor(sev: string | null): string {
  switch (sev) {
    case 'low':      return 'success';
    case 'medium':   return 'warning';
    case 'high':     return 'orange';
    case 'critical': return 'danger';
    default:         return 'secondary';
  }
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, sub }: {
  icon: string; label: string; value: React.ReactNode; color: string; sub?: string;
}) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body d-flex align-items-center gap-3">
        <div className={`rounded-circle bg-${color} bg-opacity-15 d-flex align-items-center justify-content-center flex-shrink-0`}
          style={{ width: 48, height: 48 }}>
          <i className={`bi ${icon} fs-5 text-${color}`} />
        </div>
        <div className="min-w-0">
          <div className={`fs-4 fw-bold text-${color} lh-1`}>{value}</div>
          <div className="small text-muted mt-1">{label}</div>
          {sub && <div className="small text-muted opacity-75">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

// ── AI Panel ─────────────────────────────────────────────────────────────────
function AiPanel({
  logId, endpoint, existingSummary, existingActions, existingSeverity,
}: {
  logId: string;
  endpoint: string;
  existingSummary: string | null;
  existingActions: string[] | null;
  existingSeverity: string | null;
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<AiResp | null>(
    existingSummary ? { summary: existingSummary, actions: existingActions ?? [], severity: existingSeverity ?? 'low' } : null,
  );

  const analyse = useMutation({
    mutationFn: () => apiPost<AiResp>(endpoint, {}),
    onSuccess: (data) => {
      setResult(data);
      void qc.invalidateQueries({ queryKey: ['db-monitoring'] });
    },
  });

  if (!result && !analyse.isPending) {
    return (
      <div className="card border-0 bg-light mt-3">
        <div className="card-body text-center py-4">
          <i className="bi bi-stars fs-3 text-primary mb-2 d-block" />
          <p className="small text-muted mb-3">No AI analysis yet for this run.</p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => analyse.mutate()}
          >
            <i className="bi bi-magic me-1" />
            Generate AI Analysis
          </button>
        </div>
      </div>
    );
  }

  if (analyse.isPending) {
    return (
      <div className="card border-0 bg-light mt-3">
        <div className="card-body text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
          <span className="small text-muted">AI is analysing…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 bg-light mt-3">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h6 className="fw-bold mb-0 d-flex align-items-center gap-2">
            <i className="bi bi-stars text-primary" />
            AI Analysis
          </h6>
          <span className={`badge bg-${severityColor(result?.severity ?? null)} text-uppercase`} style={{ fontSize: '0.65rem' }}>
            {result?.severity ?? '—'}
          </span>
        </div>
        <p className="small mb-3" style={{ lineHeight: 1.6 }}>{result?.summary}</p>
        {result?.actions && result.actions.length > 0 && (
          <div>
            <div className="small fw-semibold text-muted mb-2">Recommended Actions</div>
            <ul className="list-unstyled mb-0">
              {result.actions.map((a, i) => (
                <li key={i} className="d-flex gap-2 mb-1 small">
                  <i className="bi bi-arrow-right-circle-fill text-primary mt-1 flex-shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          className="btn btn-outline-secondary btn-sm mt-3"
          onClick={() => analyse.mutate()}
          disabled={analyse.isPending}
        >
          <i className="bi bi-arrow-clockwise me-1" />
          Re-analyse
        </button>
      </div>
    </div>
  );
}

// ── Mini Trend Bar ─────────────────────────────────────────────────────────────
function TrendBars({ history, field, label, color }: {
  history: Record<string, unknown>[]; field: string; label: string; color: string;
}) {
  if (!history.length) return null;
  const max = Math.max(...history.map(r => Number(r[field] ?? 0)), 1);
  return (
    <div>
      <div className="small text-muted mb-1">{label} (last {history.length} runs)</div>
      <div className="d-flex gap-1 align-items-end" style={{ height: 40 }}>
        {[...history].reverse().map((r, i) => {
          const val = Number(r[field] ?? 0);
          const pct = Math.max(4, (val / max) * 100);
          return (
            <div
              key={i}
              className={`bg-${color} rounded-top`}
              style={{ flex: 1, height: `${pct}%`, opacity: 0.7 + (i / history.length) * 0.3 }}
              title={`${fmtDate(String(r['checked_at'] ?? ''))}: ${fmtNum(val, 1)}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge bg-${statusColor(status)}-subtle border border-${statusColor(status)}-subtle text-${statusColor(status)}`}
      style={{ fontSize: '0.7rem' }}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function DetailDrawer({ logId, type, onClose }: { logId: string; type: TabId; onClose: () => void }) {
  const { data: resp, isLoading } = useQuery({
    queryKey: ['db-monitoring', type, logId],
    queryFn:  () => apiGet<{ data: Record<string, unknown> }>(`/db-monitoring/${type}/${logId}`),
  });
  const log = resp?.data;

  if (isLoading) return (
    <div className="p-4 text-center"><LoadingSpinner message="Loading detail…" /></div>
  );
  if (!log) return null;

  const aiEndpoint = `/db-monitoring/${type}/${logId}/analyse`;

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <StatusBadge status={String(log['status'] ?? '')} />
          <span className="ms-2 small text-muted">{fmtDate(String(log['checked_at'] ?? ''))}</span>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          <i className="bi bi-x-lg" />
        </button>
      </div>

      {!!log['error_message'] && (
        <div className="alert alert-danger small py-2">
          <i className="bi bi-exclamation-triangle me-1" />
          {String(log['error_message'])}
        </div>
      )}

      {/* Type-specific detail sections */}
      {type === 'performance' && (
        <PerformanceDetail log={log} />
      )}
      {type === 'integrity' && (
        <IntegrityDetail log={log} />
      )}
      {type === 'data-integrity' && (
        <DataIntegrityDetail log={log} />
      )}
      {type === 'index' && (
        <IndexDetail log={log} />
      )}

      <AiPanel
        logId={logId}
        endpoint={aiEndpoint}
        existingSummary={log['ai_summary'] as string | null}
        existingActions={log['ai_actions'] as string[] | null}
        existingSeverity={log['ai_severity'] as string | null}
      />
    </div>
  );
}

// ── Performance Detail ────────────────────────────────────────────────────────
function PerformanceDetail({ log }: { log: Record<string, unknown> }) {
  const blocking = (log['blocking'] as unknown[] | null) ?? [];
  const waitStats = (log['wait_stats'] as Record<string, unknown>[] | null) ?? [];
  const slowQueries = (log['slow_queries'] as Record<string, unknown>[] | null) ?? [];
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        {[
          { label: 'Active Connections', val: fmtNum(log['active_connections'] as number) },
          { label: 'Long-Running Queries', val: fmtNum(log['long_running_count'] as number) },
          { label: 'Blocking Chains', val: String(blocking.length) },
          { label: 'Duration (ms)', val: fmtNum(log['duration_ms'] as number) },
        ].map(({ label, val }) => (
          <div key={label} className="col-6">
            <div className="border rounded p-2 text-center">
              <div className="fw-bold fs-5">{val}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {waitStats.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-2">Top Wait Types</div>
          <div className="table-responsive">
            <table className="table table-sm table-borderless small mb-0">
              <thead className="table-light"><tr><th>Wait Type</th><th>Wait (ms)</th><th>% Total</th></tr></thead>
              <tbody>
                {waitStats.slice(0, 5).map((w, i) => (
                  <tr key={i}>
                    <td className="font-monospace" style={{ fontSize: '0.7rem' }}>{String(w['wait_type'])}</td>
                    <td>{fmtNum(w['wait_time_ms'] as number)}</td>
                    <td>{fmtNum(w['pct_of_total'] as number, 1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {blocking.length > 0 && (
        <div className="alert alert-warning small py-2">
          <i className="bi bi-exclamation-triangle me-1 fw-bold" />
          <strong>{blocking.length} active blocking chain(s)</strong> detected
        </div>
      )}

      {slowQueries.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-2">Slow Queries</div>
          {slowQueries.slice(0, 3).map((q, i) => (
            <div key={i} className="border rounded p-2 mb-2">
              <div className="d-flex justify-content-between mb-1">
                <span className="badge bg-warning-subtle text-warning border border-warning-subtle" style={{ fontSize: '0.65rem' }}>
                  {fmtNum(q['avg_duration_ms'] as number)} ms avg
                </span>
                <span className="small text-muted">{fmtNum(q['execution_count'] as number)} executions</span>
              </div>
              <code className="small text-break d-block" style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>
                {String(q['query_text'] ?? '').slice(0, 300)}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Integrity Detail ──────────────────────────────────────────────────────────
function IntegrityDetail({ log }: { log: Record<string, unknown> }) {
  const disabled = (log['disabled_constraints'] as Record<string, unknown>[] | null) ?? [];
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        {[
          { label: 'Consistency Errors', val: fmtNum(log['consistency_errors'] as number), warn: Number(log['consistency_errors']) > 0 },
          { label: 'Allocation Errors',  val: fmtNum(log['allocation_errors'] as number),  warn: Number(log['allocation_errors']) > 0 },
          { label: 'Log Space Used',     val: `${fmtNum(log['log_space_used_pct'] as number, 1)}%`, warn: Number(log['log_space_used_pct']) > 80 },
          { label: 'Disabled Constraints', val: String(disabled.length), warn: disabled.length > 0 },
        ].map(({ label, val, warn }) => (
          <div key={label} className="col-6">
            <div className={`border rounded p-2 text-center ${warn ? 'border-warning bg-warning bg-opacity-10' : ''}`}>
              <div className={`fw-bold fs-5 ${warn ? 'text-warning' : ''}`}>{val}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="small text-muted">
        <strong>Log Reuse Wait:</strong> {String(log['log_reuse_wait'] ?? 'N/A')}
      </div>
      {disabled.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-2">Disabled Constraints</div>
          <table className="table table-sm table-borderless small mb-0">
            <thead className="table-light"><tr><th>Table</th><th>Constraint</th><th>Type</th></tr></thead>
            <tbody>
              {disabled.map((c, i) => (
                <tr key={i}>
                  <td>{String(c['table_name'])}</td>
                  <td className="font-monospace" style={{ fontSize: '0.7rem' }}>{String(c['constraint_name'])}</td>
                  <td><span className="badge bg-warning-subtle text-warning border border-warning-subtle" style={{ fontSize: '0.65rem' }}>{String(c['type'])}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Data Integrity Detail ─────────────────────────────────────────────────────
function DataIntegrityDetail({ log }: { log: Record<string, unknown> }) {
  const nulls  = ((log['null_checks']      as Record<string,unknown>[] | null) ?? []).filter(r => Number(r['null_count']) > 0);
  const dups   = ((log['duplicate_checks'] as Record<string,unknown>[] | null) ?? []).filter(r => Number(r['duplicate_count']) > 0);
  const ranges = ((log['range_checks']     as Record<string,unknown>[] | null) ?? []).filter(r => Number(r['anomaly_count']) > 0);
  const counts = (log['table_row_counts']  as Record<string,unknown>[] | null) ?? [];
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        <div className="col-4">
          <div className={`border rounded p-2 text-center ${nulls.length ? 'border-warning bg-warning bg-opacity-10' : ''}`}>
            <div className="fw-bold fs-5">{nulls.length}</div>
            <div className="small text-muted">Null Violations</div>
          </div>
        </div>
        <div className="col-4">
          <div className={`border rounded p-2 text-center ${dups.length ? 'border-danger bg-danger bg-opacity-10' : ''}`}>
            <div className="fw-bold fs-5">{dups.length}</div>
            <div className="small text-muted">Duplicate Issues</div>
          </div>
        </div>
        <div className="col-4">
          <div className={`border rounded p-2 text-center ${ranges.length ? 'border-warning bg-warning bg-opacity-10' : ''}`}>
            <div className="fw-bold fs-5">{ranges.length}</div>
            <div className="small text-muted">Range Anomalies</div>
          </div>
        </div>
      </div>
      {nulls.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-1">Null Violations</div>
          <table className="table table-sm table-borderless small mb-0">
            <thead className="table-light"><tr><th>Table</th><th>Column</th><th>Null Count</th></tr></thead>
            <tbody>
              {nulls.map((r, i) => (
                <tr key={i}>
                  <td>{String(r['table_name'])}</td>
                  <td>{String(r['column_name'])}</td>
                  <td className="text-warning fw-semibold">{fmtNum(r['null_count'] as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {counts.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-1">Table Row Counts</div>
          <table className="table table-sm table-borderless small mb-0">
            <thead className="table-light"><tr><th>Table</th><th>Rows</th></tr></thead>
            <tbody>
              {counts.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  <td>{String(r['table_name'])}</td>
                  <td>{Number(r['row_count']).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Index Detail ──────────────────────────────────────────────────────────────
function IndexDetail({ log }: { log: Record<string, unknown> }) {
  const topFrag    = (log['top_fragmented']  as Record<string,unknown>[] | null) ?? [];
  const missingIdx = (log['missing_indexes'] as Record<string,unknown>[] | null) ?? [];
  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        {[
          { label: 'Total Indexes',    val: fmtNum(log['total_indexes'] as number),     color: '' },
          { label: 'Healthy',          val: fmtNum(log['healthy_count'] as number),     color: 'text-success' },
          { label: 'Need Reorganize',  val: fmtNum(log['reorganized_count'] as number), color: 'text-warning' },
          { label: 'Need Rebuild',     val: fmtNum(log['rebuilt_count'] as number),     color: 'text-danger' },
        ].map(({ label, val, color }) => (
          <div key={label} className="col-6">
            <div className="border rounded p-2 text-center">
              <div className={`fw-bold fs-5 ${color}`}>{val}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="small text-muted">
        <strong>Avg Fragmentation:</strong> {fmtNum(log['avg_fragmentation_pct'] as number, 1)}%
      </div>
      {topFrag.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-1">Most Fragmented Indexes</div>
          <table className="table table-sm table-borderless small mb-0">
            <thead className="table-light"><tr><th>Table</th><th>Index</th><th>Frag%</th><th>Action</th></tr></thead>
            <tbody>
              {topFrag.map((r, i) => {
                const action = String(r['action_recommended'] ?? '');
                const badgeCol = action === 'rebuild' ? 'danger' : action === 'reorganize' ? 'warning' : 'success';
                return (
                  <tr key={i}>
                    <td>{String(r['table_name'])}</td>
                    <td className="font-monospace" style={{ fontSize: '0.7rem' }}>{String(r['index_name'])}</td>
                    <td className="fw-semibold">{fmtNum(r['fragmentation_pct'] as number, 1)}%</td>
                    <td><span className={`badge bg-${badgeCol}-subtle text-${badgeCol} border border-${badgeCol}-subtle`} style={{ fontSize: '0.65rem' }}>{action}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {missingIdx.length > 0 && (
        <div>
          <div className="small fw-semibold text-muted mb-1">Missing Index Recommendations</div>
          {missingIdx.slice(0, 3).map((m, i) => (
            <div key={i} className="border rounded p-2 mb-2">
              <div className="d-flex justify-content-between mb-1">
                <strong className="small">{String(m['table_name'])}</strong>
                <span className="small text-muted">Impact: {fmtNum(m['impact_score'] as number, 0)}</span>
              </div>
              {!!m['equality_columns'] && <div className="small text-muted">= {String(m['equality_columns'])}</div>}
              {!!m['inequality_columns'] && <div className="small text-muted">≠ {String(m['inequality_columns'])}</div>}
              {!!m['included_columns'] && <div className="small text-muted">INCLUDE: {String(m['included_columns'])}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB SECTIONS
// ══════════════════════════════════════════════════════════════════════════════

function PerformanceTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: listResp, isLoading, error } = useQuery({
    queryKey: ['db-monitoring', 'performance'],
    queryFn:  () => apiGet<ListResp<DbPerformanceLog>>('/db-monitoring/performance'),
    staleTime: 60_000,
  });
  const { data: summary } = useQuery({
    queryKey: ['db-monitoring', 'summary'],
    queryFn:  () => apiGet<SummaryResp>('/db-monitoring/summary'),
    staleTime: 60_000,
  });

  const logs    = listResp?.data ?? [];
  const latest  = summary?.performance?.latest;
  const history = summary?.performance?.history ?? [];

  if (isLoading) return <LoadingSpinner message="Loading performance logs…" />;
  if (error)     return <ErrorAlert error={error} />;

  return (
    <div>
      {/* KPIs */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-clock-history" label="Latest Status"
            value={latest ? <StatusBadge status={latest.status} /> : '—'}
            color={statusColor(latest?.status ?? '')} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-activity" label="Active Connections"
            value={fmtNum(latest?.active_connections)} color="primary" />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-hourglass-split" label="Long-Running Queries"
            value={fmtNum(latest?.long_running_count)} color={Number(latest?.long_running_count) > 0 ? 'danger' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-exclamation-triangle" label="Critical Runs (7d)"
            value={fmtNum(summary?.performance?.critical_count)} color={Number(summary?.performance?.critical_count) > 0 ? 'danger' : 'success'} />
        </div>
      </div>

      {/* Trend */}
      {history.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body">
            <h6 className="fw-semibold mb-3">Disk I/O Trend (last 7 runs)</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <TrendBars history={history as unknown as Record<string,unknown>[]} field="disk_read_ms" label="Read Stall (ms)" color="primary" />
              </div>
              <div className="col-md-6">
                <TrendBars history={history as unknown as Record<string,unknown>[]} field="disk_write_ms" label="Write Stall (ms)" color="warning" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table + Detail */}
      <div className="row g-3">
        <div className={selectedId ? 'col-md-5' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-body p-0">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3">Date</th><th>Status</th>
                    <th>Connections</th><th>Long-Running</th><th>AI</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted py-4 small">No performance logs yet.</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className={selectedId === log.id ? 'table-primary' : ''}>
                      <td className="ps-3 small">{fmtDate(log.checked_at)}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td className="small">{fmtNum(log.active_connections)}</td>
                      <td className="small">{fmtNum(log.long_running_count)}</td>
                      <td>
                        {log.ai_severity && (
                          <span className={`badge bg-${severityColor(log.ai_severity)}-subtle text-${severityColor(log.ai_severity)} border`} style={{ fontSize: '0.6rem' }}>
                            {log.ai_severity}
                          </span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-link p-0 text-primary"
                          onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}>
                          <i className={`bi ${selectedId === log.id ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {selectedId && (
          <div className="col-md-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <DetailDrawer logId={selectedId} type="performance" onClose={() => setSelectedId(null)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrityTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: listResp, isLoading, error } = useQuery({
    queryKey: ['db-monitoring', 'integrity'],
    queryFn:  () => apiGet<ListResp<DbIntegrityLog>>('/db-monitoring/integrity'),
    staleTime: 60_000,
  });
  const { data: summary } = useQuery({
    queryKey: ['db-monitoring', 'summary'],
    queryFn:  () => apiGet<SummaryResp>('/db-monitoring/summary'),
    staleTime: 60_000,
  });

  const logs   = listResp?.data ?? [];
  const latest = summary?.integrity?.latest;

  if (isLoading) return <LoadingSpinner message="Loading integrity logs…" />;
  if (error)     return <ErrorAlert error={error} />;

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-database-check" label="Latest Status"
            value={latest ? <StatusBadge status={latest.status} /> : '—'}
            color={statusColor(latest?.status ?? '')} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-exclamation-octagon" label="Consistency Errors"
            value={fmtNum(latest?.consistency_errors)} color={Number(latest?.consistency_errors) > 0 ? 'danger' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-hdd" label="Log Space Used"
            value={`${fmtNum(latest?.log_space_used_pct, 1)}%`}
            color={Number(latest?.log_space_used_pct) > 80 ? 'danger' : Number(latest?.log_space_used_pct) > 60 ? 'warning' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-shield-x" label="Error Runs (7d)"
            value={fmtNum(summary?.integrity?.error_count)} color={Number(summary?.integrity?.error_count) > 0 ? 'danger' : 'success'} />
        </div>
      </div>

      <div className="row g-3">
        <div className={selectedId ? 'col-md-5' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-body p-0">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3">Date</th><th>Status</th>
                    <th>Consistency Err</th><th>Log Used %</th><th>AI</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted py-4 small">No integrity logs yet.</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className={selectedId === log.id ? 'table-primary' : ''}>
                      <td className="ps-3 small">{fmtDate(log.checked_at)}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td className={`small ${Number(log.consistency_errors) > 0 ? 'text-danger fw-semibold' : ''}`}>
                        {fmtNum(log.consistency_errors)}
                      </td>
                      <td className="small">{fmtNum(log.log_space_used_pct, 1)}%</td>
                      <td>
                        {log.ai_severity && (
                          <span className={`badge bg-${severityColor(log.ai_severity)}-subtle text-${severityColor(log.ai_severity)} border`} style={{ fontSize: '0.6rem' }}>
                            {log.ai_severity}
                          </span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-link p-0 text-primary"
                          onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}>
                          <i className={`bi ${selectedId === log.id ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {selectedId && (
          <div className="col-md-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <DetailDrawer logId={selectedId} type="integrity" onClose={() => setSelectedId(null)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataIntegrityTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: listResp, isLoading, error } = useQuery({
    queryKey: ['db-monitoring', 'data-integrity'],
    queryFn:  () => apiGet<ListResp<DbDataIntegrityLog>>('/db-monitoring/data-integrity'),
    staleTime: 60_000,
  });
  const { data: summary } = useQuery({
    queryKey: ['db-monitoring', 'summary'],
    queryFn:  () => apiGet<SummaryResp>('/db-monitoring/summary'),
    staleTime: 60_000,
  });

  const logs   = listResp?.data ?? [];
  const latest = summary?.data_integrity?.latest;

  if (isLoading) return <LoadingSpinner message="Loading data integrity logs…" />;
  if (error)     return <ErrorAlert error={error} />;

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-table" label="Latest Status"
            value={latest ? <StatusBadge status={latest.status} /> : '—'}
            color={statusColor(latest?.status ?? '')} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-bug" label="Total Issues (Latest)"
            value={fmtNum(latest?.total_issues)} color={Number(latest?.total_issues) > 0 ? 'warning' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-clipboard-data" label="Total Issues (7d)"
            value={fmtNum(summary?.data_integrity?.issue_count)} color={Number(summary?.data_integrity?.issue_count) > 0 ? 'danger' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-shield-check" label="AI Severity"
            value={latest?.ai_severity ?? '—'} color={severityColor(latest?.ai_severity ?? null)} />
        </div>
      </div>

      <div className="row g-3">
        <div className={selectedId ? 'col-md-5' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-body p-0">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr><th className="ps-3">Date</th><th>Status</th><th>Issues</th><th>AI</th><th></th></tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted py-4 small">No data integrity logs yet.</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className={selectedId === log.id ? 'table-primary' : ''}>
                      <td className="ps-3 small">{fmtDate(log.checked_at)}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td className={`small ${Number(log.total_issues) > 0 ? 'text-warning fw-semibold' : 'text-success'}`}>
                        {fmtNum(log.total_issues)}
                      </td>
                      <td>
                        {log.ai_severity && (
                          <span className={`badge bg-${severityColor(log.ai_severity)}-subtle text-${severityColor(log.ai_severity)} border`} style={{ fontSize: '0.6rem' }}>
                            {log.ai_severity}
                          </span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-link p-0 text-primary"
                          onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}>
                          <i className={`bi ${selectedId === log.id ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {selectedId && (
          <div className="col-md-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <DetailDrawer logId={selectedId} type="data-integrity" onClose={() => setSelectedId(null)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IndexTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: listResp, isLoading, error } = useQuery({
    queryKey: ['db-monitoring', 'index'],
    queryFn:  () => apiGet<ListResp<DbIndexLog>>('/db-monitoring/index'),
    staleTime: 60_000,
  });
  const { data: summary } = useQuery({
    queryKey: ['db-monitoring', 'summary'],
    queryFn:  () => apiGet<SummaryResp>('/db-monitoring/summary'),
    staleTime: 60_000,
  });

  const logs   = listResp?.data ?? [];
  const latest = summary?.index?.latest;
  const history = summary?.index?.history ?? [];

  if (isLoading) return <LoadingSpinner message="Loading index logs…" />;
  if (error)     return <ErrorAlert error={error} />;

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-list-columns-reverse" label="Total Indexes"
            value={fmtNum(latest?.total_indexes)} color="primary" />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-arrow-clockwise" label="Need Rebuild"
            value={fmtNum(latest?.rebuilt_count)} color={Number(latest?.rebuilt_count) > 0 ? 'danger' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-wrench" label="Need Reorganize"
            value={fmtNum(latest?.reorganized_count)} color={Number(latest?.reorganized_count) > 0 ? 'warning' : 'success'} />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard icon="bi-bar-chart" label="Avg Fragmentation"
            value={`${fmtNum(latest?.avg_fragmentation_pct, 1)}%`}
            color={Number(latest?.avg_fragmentation_pct) > 30 ? 'danger' : Number(latest?.avg_fragmentation_pct) > 10 ? 'warning' : 'success'} />
        </div>
      </div>

      {/* Alert banner */}
      {Number(latest?.rebuilt_count) > 10 && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-exclamation-triangle-fill fs-5" />
          <div>
            <strong>High Index Fragmentation Alert:</strong> {latest?.rebuilt_count} indexes require a full rebuild. This is impacting query performance.
          </div>
        </div>
      )}

      {/* Trend */}
      {history.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body">
            <h6 className="fw-semibold mb-3">Fragmentation Trend (last 7 runs)</h6>
            <TrendBars history={history as unknown as Record<string,unknown>[]} field="avg_fragmentation_pct" label="Avg Fragmentation %" color="danger" />
          </div>
        </div>
      )}

      <div className="row g-3">
        <div className={selectedId ? 'col-md-5' : 'col-12'}>
          <div className="card border-0 shadow-sm">
            <div className="card-body p-0">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3">Date</th><th>Status</th>
                    <th>Rebuild</th><th>Reorg</th><th>Avg Frag%</th><th>AI</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted py-4 small">No index logs yet.</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className={selectedId === log.id ? 'table-primary' : ''}>
                      <td className="ps-3 small">{fmtDate(log.checked_at)}</td>
                      <td><StatusBadge status={log.status} /></td>
                      <td className={`small ${Number(log.rebuilt_count) > 0 ? 'text-danger fw-semibold' : ''}`}>{fmtNum(log.rebuilt_count)}</td>
                      <td className={`small ${Number(log.reorganized_count) > 0 ? 'text-warning' : ''}`}>{fmtNum(log.reorganized_count)}</td>
                      <td className="small">{fmtNum(log.avg_fragmentation_pct, 1)}%</td>
                      <td>
                        {log.ai_severity && (
                          <span className={`badge bg-${severityColor(log.ai_severity)}-subtle text-${severityColor(log.ai_severity)} border`} style={{ fontSize: '0.6rem' }}>
                            {log.ai_severity}
                          </span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-link p-0 text-primary"
                          onClick={() => setSelectedId(selectedId === log.id ? null : log.id)}>
                          <i className={`bi ${selectedId === log.id ? 'bi-chevron-left' : 'bi-chevron-right'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {selectedId && (
          <div className="col-md-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <DetailDrawer logId={selectedId} type="index" onClose={() => setSelectedId(null)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ── Trigger result state ─────────────────────────────────────────────────────
type TriggerState = { status: 'idle' } | { status: 'success'; funcName: string } | { status: 'error'; message: string };

export function DbMonitoring() {
  const [tab, setTab] = useState<TabId>('performance');
  const [triggerState, setTriggerState] = useState<TriggerState>({ status: 'idle' });
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['db-monitoring', 'summary'],
    queryFn:  () => apiGet<SummaryResp>('/db-monitoring/summary'),
    staleTime: 60_000,
  });

  const trigger = useMutation({
    mutationFn: (type: TabId) => apiPost<{ ok: boolean; functionName: string; type: string }>(`/db-monitoring/trigger/${type}`, {}),
    onSuccess: (data) => {
      setTriggerState({ status: 'success', funcName: data.functionName });
      // Refresh all db-monitoring queries after a short delay so new log has time to arrive
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['db-monitoring'] }), 3500);
      setTimeout(() => setTriggerState({ status: 'idle' }), 8000);
    },
    onError: (err: Error) => {
      setTriggerState({ status: 'error', message: err.message });
      setTimeout(() => setTriggerState({ status: 'idle' }), 6000);
    },
  });

  const tabs: { id: TabId; icon: string; label: string; badge?: number | null; badgeColor?: string }[] = [
    {
      id: 'performance', icon: 'bi-speedometer', label: 'Performance',
      badge: summary?.performance?.critical_count ?? null,
      badgeColor: 'danger',
    },
    {
      id: 'integrity', icon: 'bi-database-check', label: 'DB Integrity',
      badge: summary?.integrity?.error_count ?? null,
      badgeColor: 'danger',
    },
    {
      id: 'data-integrity', icon: 'bi-table', label: 'Data Integrity',
      badge: summary?.data_integrity?.issue_count ?? null,
      badgeColor: 'warning',
    },
    {
      id: 'index', icon: 'bi-list-columns-reverse', label: 'Index Maintenance',
      badge: summary?.index?.rebuild_total ?? null,
      badgeColor: 'danger',
    },
  ];

  const tabLabels: Record<TabId, string> = {
    'performance':    'Performance Check',
    'integrity':      'Integrity Check',
    'data-integrity': 'Data Integrity Check',
    'index':          'Index Maintenance Check',
  };

  return (
    <div>
      <PageHeader
        title="Database Monitoring"
        subtitle="Auto-logged performance, integrity, and index health with AI-powered analysis"
      />

      {/* Manual Trigger Banner */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          {triggerState.status === 'success' && (
            <div className="alert alert-success d-flex align-items-center gap-2 py-2 mb-0 small">
              <i className="bi bi-check-circle-fill" />
              <span>
                <strong>{triggerState.funcName}</strong> triggered successfully — new results will appear shortly.
              </span>
            </div>
          )}
          {triggerState.status === 'error' && (
            <div className="alert alert-danger d-flex align-items-center gap-2 py-2 mb-0 small">
              <i className="bi bi-exclamation-triangle-fill" />
              <span>{triggerState.message}</span>
            </div>
          )}
        </div>
        <button
          className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2 flex-shrink-0"
          onClick={() => { setTriggerState({ status: 'idle' }); trigger.mutate(tab); }}
          disabled={trigger.isPending}
          title={`Manually run ${tabLabels[tab]} now`}
        >
          {trigger.isPending ? (
            <><span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /><span>Running…</span></>
          ) : (
            <><i className="bi bi-play-circle-fill" /><span>Run {tabLabels[tab]}</span></>
          )}
        </button>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4" role="tablist">
        {tabs.map(t => (
          <li key={t.id} className="nav-item" role="presentation">
            <button
              className={`nav-link d-flex align-items-center gap-2 ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              role="tab"
            >
              <i className={`bi ${t.icon}`} />
              <span className="d-none d-sm-inline">{t.label}</span>
              {!!t.badge && t.badge > 0 && (
                <span className={`badge bg-${t.badgeColor ?? 'secondary'} rounded-pill`} style={{ fontSize: '0.6rem' }}>
                  {t.badge}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Tab Content */}
      {tab === 'performance'    && <PerformanceTab />}
      {tab === 'integrity'      && <IntegrityTab />}
      {tab === 'data-integrity' && <DataIntegrityTab />}
      {tab === 'index'          && <IndexTab />}
    </div>
  );
}
