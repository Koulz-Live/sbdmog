// apps/web/src/pages/PopiaEvents.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { PopiaEvent } from '@heqcis/types';

interface ListResponse { data: PopiaEvent[]; count: number; }

const COLUMNS: Column<PopiaEvent>[] = [
  { key: 'description', header: 'Description' },
  { key: 'event_type',  header: 'Type',   width: '130px' },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'created_at',
    header: 'Logged',
    width: '160px',
    render: (r) => new Date(r.created_at).toLocaleString('en-ZA'),
  },
  {
    key: 'resolved_at',
    header: 'Resolved',
    width: '150px',
    render: (r) => r.resolved_at
      ? new Date(r.resolved_at).toLocaleDateString('en-ZA')
      : '—',
  },
  {
    key: 'data_subject',
    header: 'Data Subject',
    width: '150px',
    render: (r) => r.data_subject ?? '—',
  },
];

export function PopiaEvents() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['popiaEvents', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/popia-events${query}`),
  });

  const events = data?.data  ?? [];
  const total  = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="POPIA Events" subtitle={`${total} records consistently maintained`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && events.length === 0 && (
        <EmptyState icon="bi-person-lock" title="No events recorded" message="The ledger is clean." />
      )}
      {events.length > 0 && (
        <DataTable columns={COLUMNS} data={events} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
