// apps/web/src/pages/Dashboard.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { useNavigate } from 'react-router-dom';

interface DashboardSummary {
  open_incidents:            number;
  p1_p2_incidents:           number;
  failed_backups_24h:        number;
  failed_etl_24h:            number;
  open_security_findings:    number;
  critical_security_findings: number;
  pending_change_requests:   number;
  open_popia_events:         number;
}

// ─── Azure SQL stats types ────────────────────────────────────────────────────

interface ColumnBreakdownItem {
  label: string;
  count: number;
}

interface TableStat {
  table:       string;
  description: string;
  total_rows:  number;
  columns:     { name: string; label: string; breakdown: ColumnBreakdownItem[] }[];
  last_updated: string | null;
}

interface SqlStatsResponse {
  connected:   boolean;
  latency_ms:  number;
  checked_at:  string;
  server:      string;
  database:    string;
  tables:      TableStat[];
  error:       string | null;
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  title:     string;
  value:     number;
  variant:   'danger' | 'warning' | 'success' | 'info';
  icon:      string;
  linkTo?:   string;
}

function SummaryCard({ title, value, variant, icon, linkTo }: SummaryCardProps) {
  const navigate = useNavigate();
  return (
    <div
      className={`summary-card ${variant} p-3 rounded-2 bg-white shadow-sm ${linkTo ? 'cursor-pointer' : ''}`}
      style={linkTo ? { cursor: 'pointer' } : undefined}
      onClick={linkTo ? () => navigate(linkTo) : undefined}
      role={linkTo ? 'button' : undefined}
    >
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <div className="text-muted small fw-semibold text-uppercase mb-1" style={{ fontSize: '0.7rem' }}>
            {title}
          </div>
          <div className="fs-2 fw-bold">{value}</div>
        </div>
        <i className={`bi ${icon} fs-3 text-${variant === 'info' ? 'info' : variant}`} />
      </div>
    </div>
  );
}

// ─── Azure SQL panel ──────────────────────────────────────────────────────────

function breakdownVariant(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('fail') || l.includes('damage'))  return 'danger';
  if (l.includes('cancel') || l.includes('retry'))  return 'warning';
  if (l.includes('success') || l.includes('healthy') || l.includes('enabled')) return 'success';
  return 'secondary';
}

function SqlTableCard({ stat }: { stat: TableStat }) {
  const shortName = stat.table.replace('dbo.', '');

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between py-2">
        <div>
          <span className="fw-semibold me-2" style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>
            {stat.table}
          </span>
          <span
            className="badge bg-primary bg-opacity-10 text-primary fw-semibold"
            style={{ fontSize: '0.75rem' }}
          >
            {stat.total_rows.toLocaleString()} rows
          </span>
        </div>
        {stat.last_updated && (
          <span className="text-muted" style={{ fontSize: '0.7rem' }}>
            latest: {new Date(stat.last_updated).toLocaleString()}
          </span>
        )}
      </div>

      <div className="card-body p-3">
        <p className="text-muted mb-3" style={{ fontSize: '0.8rem' }}>{stat.description}</p>

        <div className="row g-3">
          {stat.columns.map((col) => (
            <div key={col.name} className="col-12 col-md-4">
              <div className="text-muted fw-semibold text-uppercase mb-2" style={{ fontSize: '0.68rem', letterSpacing: '0.04em' }}>
                {col.label}
              </div>
              <table className="table table-sm table-borderless mb-0" style={{ fontSize: '0.82rem' }}>
                <tbody>
                  {col.breakdown.map((item) => (
                    <tr key={item.label}>
                      <td className="ps-0 py-1">
                        <span className={`badge bg-${breakdownVariant(item.label)} bg-opacity-10 text-${breakdownVariant(item.label)} fw-normal`}>
                          {item.label}
                        </span>
                      </td>
                      <td className="py-1 text-end fw-semibold pe-0">
                        {typeof item.count === 'number' && item.count % 1 !== 0
                          ? `${item.count.toFixed(2)} GB`
                          : item.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AzureSqlPanel({ stats, isLoading, error, refetch }: {
  stats:     SqlStatsResponse | undefined;
  isLoading: boolean;
  error:     Error | null;
  refetch:   () => void;
}) {
  return (
    <div className="mt-5">
      {/* Section header */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-database-fill text-primary fs-5" />
          <h5 className="mb-0 fw-semibold">Azure SQL Database</h5>
          {stats && (
            <span
              className={`badge ${stats.connected ? 'bg-success' : 'bg-danger'} ms-1`}
              style={{ fontSize: '0.7rem' }}
            >
              {stats.connected ? `Faithful · ${stats.latency_ms} ms` : 'Unreachable'}
            </span>
          )}
        </div>
        {stats && (
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
            <span className="me-2 fw-semibold" style={{ fontFamily: 'monospace' }}>{stats.server}</span>
            / <span className="ms-1 fw-semibold" style={{ fontFamily: 'monospace' }}>{stats.database}</span>
          </span>
        )}
      </div>

      {isLoading && <LoadingSpinner message="Querying the source…" size="sm" />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}

      {stats && !stats.connected && (
        <div className="alert alert-warning d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>The source is unreachable: {stats.error}</span>
        </div>
      )}

      {stats?.connected && (
        <div className="row g-3">
          {stats.tables.map((t) => (
            <div key={t.table} className="col-12 col-xl-6">
              <SqlTableCard stat={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export function Dashboard() {
  const {
    data:    summary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => apiGet<DashboardSummary>('/dashboard'),
  });

  const {
    data:    sqlStats,
    isLoading: sqlLoading,
    error:     sqlError,
    refetch:   sqlRefetch,
  } = useQuery({
    queryKey:           ['sql-stats'],
    queryFn:            () => apiGet<SqlStatsResponse>('/sql-stats'),
    staleTime:          60_000,   // re-fetch after 1 min
    refetchOnWindowFocus: false,
  });

  function handleRefresh() {
    refetch();
    sqlRefetch();
  }

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle="A faithful account of all HEQCIS service health indicators"
        actions={
          <button className="btn btn-sm btn-outline-secondary" onClick={handleRefresh}>
            <i className="bi bi-arrow-clockwise me-1" />
            Renew
          </button>
        }
      />

      {isLoading && <LoadingSpinner message="Gathering service data…" />}
      {error    && <ErrorAlert error={error} onRetry={refetch} />}

      {summary && (
        <div className="row g-3">
          {/* Row 1 — Incidents */}
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Open Incidents"
              value={summary.open_incidents}
              variant="danger"
              icon="bi-exclamation-triangle-fill"
              linkTo="/incidents"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="P1 / P2 Incidents"
              value={summary.p1_p2_incidents}
              variant="danger"
              icon="bi-fire"
              linkTo="/incidents?severity=P1"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Failed Backups (24 h)"
              value={summary.failed_backups_24h}
              variant="warning"
              icon="bi-cloud-slash-fill"
              linkTo="/backup-runs?status=failed"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Failed ETL Jobs (24 h)"
              value={summary.failed_etl_24h}
              variant="warning"
              icon="bi-arrow-repeat"
              linkTo="/etl-runs?status=failed"
            />
          </div>

          {/* Row 2 — Security / Governance */}
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Open Security Findings"
              value={summary.open_security_findings}
              variant="danger"
              icon="bi-shield-exclamation"
              linkTo="/security-findings"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Critical Findings"
              value={summary.critical_security_findings}
              variant="danger"
              icon="bi-shield-fill-exclamation"
              linkTo="/security-findings?severity=critical"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Pending Change Requests"
              value={summary.pending_change_requests}
              variant="info"
              icon="bi-arrow-left-right"
              linkTo="/change-requests?status=submitted"
            />
          </div>
          <div className="col-sm-6 col-xl-3">
            <SummaryCard
              title="Open POPIA Events"
              value={summary.open_popia_events}
              variant="warning"
              icon="bi-person-lock"
              linkTo="/popia-events"
            />
          </div>
        </div>
      )}

      {/* Azure SQL section */}
      <AzureSqlPanel
        stats={sqlStats}
        isLoading={sqlLoading}
        error={sqlError}
        refetch={sqlRefetch}
      />
    </div>
  );
}

