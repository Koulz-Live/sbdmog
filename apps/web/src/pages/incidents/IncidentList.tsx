// apps/web/src/pages/incidents/IncidentList.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIncidents, useCreateIncident } from '../../hooks/useIncidents.js';
import { DataTable, type Column } from '../../common/DataTable.js';
import { StatusBadge } from '../../common/StatusBadge.js';
import { SeverityBadge } from '../../common/SeverityBadge.js';
import { PageHeader } from '../../layout/PageHeader.js';
import { LoadingSpinner } from '../../common/LoadingSpinner.js';
import { ErrorAlert } from '../../common/ErrorAlert.js';
import { EmptyState } from '../../common/EmptyState.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { Incident } from '@heqcis/types';

const PAGE_SIZE = 25;

const COLUMNS: Column<Incident>[] = [
  { key: 'reference',       header: 'Reference',    width: '130px' },
  { key: 'title',           header: 'Title' },
  {
    key: 'severity',
    header: 'Severity',
    width: '90px',
    render: (row) => <SeverityBadge severity={row.severity} />,
  },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'created_at',
    header: 'Logged',
    width: '160px',
    render: (row) => new Date(row.created_at).toLocaleString('en-ZA'),
  },
  {
    key: 'affected_system',
    header: 'System',
    width: '140px',
  },
];

export function IncidentList() {
  const navigate = useNavigate();
  const { isEngineer } = useAuth();

  const [statusFilter,   setStatusFilter]   = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page,           setPage]           = useState(0);

  const { data, isLoading, error, refetch } = useIncidents({
    status:   statusFilter   || undefined,
    severity: severityFilter || undefined,
    limit:    PAGE_SIZE,
    offset:   page * PAGE_SIZE,
  });

  const incidents = data?.data ?? [];
  const total     = data?.count ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Incidents"
        subtitle={`${total} record${total !== 1 ? 's' : ''}`}
        actions={undefined}
      />

      {/* Filters */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
        >
          <option value="">All severities</option>
          <option value="P1">P1 — Critical</option>
          <option value="P2">P2 — High</option>
          <option value="P3">P3 — Medium</option>
          <option value="P4">P4 — Low</option>
        </select>

        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={() => refetch()}
        >
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}

      {!isLoading && !error && incidents.length === 0 && (
        <EmptyState
          icon="bi-exclamation-triangle"
          title="No incidents found"
          message="Adjust your filters or log a new incident."
        />
      )}

      {incidents.length > 0 && (
        <>
          <DataTable
            columns={COLUMNS}
            data={incidents}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/incidents/${row.id}`)}
          />

          {/* Pagination */}
          {pageCount > 1 && (
            <nav className="d-flex justify-content-between align-items-center mt-3">
              <span className="text-muted small">
                Page {page + 1} of {pageCount}
              </span>
              <div className="btn-group btn-group-sm">
                <button
                  className="btn btn-outline-secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn btn-outline-secondary"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
