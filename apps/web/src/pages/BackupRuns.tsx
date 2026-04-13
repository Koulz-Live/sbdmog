// apps/web/src/pages/BackupRuns.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { BackupRun } from '@heqcis/types';

interface ListResponse { data: BackupRun[]; count: number; }

const COLUMNS: Column<BackupRun>[] = [
  { key: 'database_name', header: 'Database' },
  { key: 'backup_type',   header: 'Type', width: '100px' },
  { key: 'source',        header: 'Source', width: '100px' },
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
    key: 'finished_at',
    header: 'Finished',
    width: '160px',
    render: (r) => r.finished_at ? new Date(r.finished_at).toLocaleString('en-ZA') : '—',
  },
  {
    key: 'size_bytes',
    header: 'Size',
    width: '100px',
    render: (r) =>
      r.size_bytes != null
        ? `${(r.size_bytes / 1_048_576).toFixed(1)} MB`
        : '—',
  },
];

export function BackupRuns() {
  const [statusFilter, setStatusFilter] = useState('');
  const query = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['backupRuns', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/backup-runs${query}`),
  });

  const runs  = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Backup Runs" subtitle={`${total} records`} />

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
        <EmptyState icon="bi-cloud-upload" title="No backup runs found" />
      )}
      {runs.length > 0 && (
        <DataTable columns={COLUMNS} data={runs} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
