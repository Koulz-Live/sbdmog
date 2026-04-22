// apps/web/src/pages/ReportRequests.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { ReportRequest } from '@heqcis/types';

interface ListResponse { data: ReportRequest[]; count: number; }

const COLUMNS: Column<ReportRequest>[] = [
  { key: 'title',          header: 'Title' },
  { key: 'report_type',    header: 'Type',     width: '150px' },
  { key: 'priority',       header: 'Priority', width: '100px' },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'due_date',
    header: 'Due Date',
    width: '130px',
    render: (r) => r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : '—',
  },
  {
    key: 'created_at',
    header: 'Requested',
    width: '140px',
    render: (r) => new Date(r.created_at).toLocaleDateString('en-ZA'),
  },
];

export function ReportRequests() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reportRequests', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/report-requests${query}`),
  });

  const reports = data?.data  ?? [];
  const total   = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Report Requests" subtitle={`${total} records consistently maintained`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="submitted">Submitted</option>
          <option value="in_progress">In Progress</option>
          <option value="delivered">Delivered</option>
          <option value="closed">Closed</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && reports.length === 0 && (
        <EmptyState icon="bi-file-earmark-text" title="No requests recorded" />
      )}
      {reports.length > 0 && (
        <DataTable columns={COLUMNS} data={reports} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
