// apps/web/src/pages/HandoverItems.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { HandoverItem } from '@heqcis/types';

interface ListResponse { data: HandoverItem[]; count: number; }

const COLUMNS: Column<HandoverItem>[] = [
  { key: 'title',    header: 'Title' },
  { key: 'category', header: 'Category', width: '140px' },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  { key: 'owner_id', header: 'Owner', width: '140px' },
  {
    key: 'target_date',
    header: 'Target Date',
    width: '130px',
    render: (r) => r.target_date ? new Date(r.target_date).toLocaleDateString('en-ZA') : '—',
  },
];

export function HandoverItems() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['handoverItems', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/handover-items${query}`),
  });

  const items = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Handover Items" subtitle={`${total} records consistently maintained`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState icon="bi-box-arrow-in-right" title="No items recorded" />
      )}
      {items.length > 0 && (
        <DataTable columns={COLUMNS} data={items} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
