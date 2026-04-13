// apps/web/src/pages/Maintenance.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { MaintenanceActivity } from '@heqcis/types';

interface ListResponse { data: MaintenanceActivity[]; count: number; }

const COLUMNS: Column<MaintenanceActivity>[] = [
  { key: 'title',          header: 'Title' },
  { key: 'activity_type',  header: 'Type', width: '120px' },
  {
    key: 'status',
    header: 'Status',
    width: '110px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'scheduled_at',
    header: 'Scheduled',
    width: '160px',
    render: (r) => r.scheduled_at ? new Date(r.scheduled_at).toLocaleString('en-ZA') : '—',
  },
  {
    key: 'completed_at',
    header: 'Completed',
    width: '160px',
    render: (r) => r.completed_at ? new Date(r.completed_at).toLocaleString('en-ZA') : '—',
  },
  { key: 'system_target', header: 'System' },
];

export function Maintenance() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['maintenance', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/maintenance-activities${query}`),
  });

  const activities = data?.data  ?? [];
  const total      = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Maintenance Activities" subtitle={`${total} records`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && activities.length === 0 && (
        <EmptyState icon="bi-tools" title="No maintenance activities found" />
      )}
      {activities.length > 0 && (
        <DataTable columns={COLUMNS} data={activities} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
