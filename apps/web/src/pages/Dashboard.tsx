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

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live summary of all HEQCIS service health indicators"
        actions={
          <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
            <i className="bi bi-arrow-clockwise me-1" />
            Refresh
          </button>
        }
      />

      {isLoading && <LoadingSpinner message="Loading dashboard…" />}
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
    </div>
  );
}
