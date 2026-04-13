// apps/web/src/pages/SubmissionReadiness.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { SubmissionReadinessCheck } from '@heqcis/types';

interface ListResponse { data: SubmissionReadinessCheck[]; count: number; }

const COLUMNS: Column<SubmissionReadinessCheck>[] = [
  { key: 'submission_type', header: 'Type', width: '150px' },
  { key: 'period',          header: 'Period' },
  {
    key: 'overall_status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.overall_status} />,
  },
  {
    key: 'checked_at',
    header: 'Checked',
    width: '160px',
    render: (r) => r.checked_at ? new Date(r.checked_at).toLocaleString('en-ZA') : '—',
  },
  {
    key: 'notes',
    header: 'Notes',
    render: (r) => r.notes ?? '—',
  },
];

export function SubmissionReadiness() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['submissionReadiness'],
    queryFn:  () => apiGet<ListResponse>('/submission-readiness'),
  });

  const checks = data?.data  ?? [];
  const total  = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Submission Readiness" subtitle={`${total} checks`} />

      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise me-1" />
          Refresh
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && checks.length === 0 && (
        <EmptyState icon="bi-check2-circle" title="No readiness checks found" />
      )}
      {checks.length > 0 && (
        <DataTable columns={COLUMNS} data={checks} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
