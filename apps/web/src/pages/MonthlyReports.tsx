// apps/web/src/pages/MonthlyReports.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { MonthlyReport } from '@heqcis/types';

interface ListResponse { data: MonthlyReport[]; count: number; }

const COLUMNS: Column<MonthlyReport>[] = [
  { key: 'period_label', header: 'Period' },
  { key: 'title',        header: 'Title' },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'created_at',
    header: 'Created',
    width: '140px',
    render: (r) => new Date(r.created_at).toLocaleDateString('en-ZA'),
  },
  {
    key: 'published_at',
    header: 'Published',
    width: '140px',
    render: (r) =>
      r.published_at ? new Date(r.published_at).toLocaleDateString('en-ZA') : '—',
  },
];

export function MonthlyReports() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['monthlyReports'],
    queryFn:  () => apiGet<ListResponse>('/monthly-reports'),
  });

  const reports = data?.data  ?? [];
  const total   = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Monthly Reports" subtitle={`${total} reports`} />

      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && reports.length === 0 && (
        <EmptyState icon="bi-calendar3" title="No monthly reports found" />
      )}
      {reports.length > 0 && (
        <DataTable columns={COLUMNS} data={reports} rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/monthly-reports/${r.id}`)} />
      )}
    </div>
  );
}
