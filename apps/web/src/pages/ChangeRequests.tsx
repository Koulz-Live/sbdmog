// apps/web/src/pages/ChangeRequests.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { ChangeRequest } from '@heqcis/types';

interface ListResponse { data: ChangeRequest[]; count: number; }

const COLUMNS: Column<ChangeRequest>[] = [
  { key: 'reference',      header: 'Reference', width: '130px' },
  { key: 'title',          header: 'Title' },
  { key: 'type',           header: 'Type',      width: '110px' },
  { key: 'risk_level',     header: 'Risk',      width: '90px' },
  {
    key: 'status',
    header: 'Status',
    width: '120px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'scheduled_date',
    header: 'Scheduled',
    width: '140px',
    render: (r) => r.scheduled_date ? new Date(r.scheduled_date).toLocaleDateString('en-ZA') : '—',
  },
];

export function ChangeRequests() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['changeRequests', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/change-requests${query}`),
  });

  const crs   = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Change Requests" subtitle={`${total} records`} />

      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="implemented">Implemented</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && crs.length === 0 && (
        <EmptyState icon="bi-arrow-left-right" title="No change requests found" />
      )}
      {crs.length > 0 && (
        <DataTable
          columns={COLUMNS}
          data={crs}
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}
