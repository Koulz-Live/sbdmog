// apps/web/src/pages/EtlRuns.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { EtlRun } from '@heqcis/types';

interface ListResponse { data: EtlRun[]; count: number; }

const COLUMNS: Column<EtlRun>[] = [
  { key: 'job_name',          header: 'Job Name' },
  { key: 'source',            header: 'Source', width: '100px' },
  {
    key: 'status',
    header: 'Status',
    width: '110px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'started_at',
    header: 'Started',
    width: '160px',
    render: (r) => r.started_at ? new Date(r.started_at).toLocaleString('en-ZA') : '—',
  },
  {
    key: 'rows_processed',
    header: 'Rows Processed',
    width: '140px',
    render: (r) => r.rows_processed?.toLocaleString() ?? '—',
  },
  {
    key: 'rows_failed',
    header: 'Rows Failed',
    width: '120px',
    render: (r) => r.rows_failed?.toLocaleString() ?? '—',
  },
];

export function EtlRuns() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['etlRuns', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/etl-runs${query}`),
  });

  const runs  = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="ETL Runs" subtitle={`${total} records faithfully kept`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="partial">Partial</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && runs.length === 0 && (
        <EmptyState icon="bi-arrow-repeat" title="No runs recorded" message="Every journey begins with the first step." />
      )}
      {runs.length > 0 && (
        <DataTable columns={COLUMNS} data={runs} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
