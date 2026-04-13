// apps/web/src/pages/AuditLogs.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { AuditLog } from '@heqcis/types';

interface ListResponse { data: AuditLog[]; count: number; }

const COLUMNS: Column<AuditLog>[] = [
  {
    key: 'created_at',
    header: 'Timestamp',
    width: '170px',
    render: (r) => new Date(r.created_at).toLocaleString('en-ZA'),
  },
  { key: 'actor_id',      header: 'Actor',          width: '130px' },
  { key: 'resource_type', header: 'Resource',        width: '140px' },
  { key: 'resource_id',   header: 'Resource ID',     width: '130px' },
  { key: 'action',        header: 'Action',          width: '100px' },
  {
    key: 'id',
    header: 'Log ID',
    width: '120px',
    render: (r) => r.id.slice(0, 8) + '…',
  },
];

export function AuditLogs() {
  const [resourceFilter, setResourceFilter] = useState('');
  const qs = resourceFilter ? `?resource_type=${encodeURIComponent(resourceFilter)}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['auditLogs', resourceFilter],
    queryFn:  () => apiGet<ListResponse>(`/audit-logs${qs}`),
  });

  const logs  = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle={`${total} entries`} />

      <div className="d-flex gap-2 mb-3">
        <input
          type="text"
          className="form-control form-control-sm"
          style={{ maxWidth: 240 }}
          placeholder="Filter by resource type…"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
        />
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && logs.length === 0 && (
        <EmptyState icon="bi-journal-text" title="No audit log entries found" />
      )}
      {logs.length > 0 && (
        <DataTable columns={COLUMNS} data={logs} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
