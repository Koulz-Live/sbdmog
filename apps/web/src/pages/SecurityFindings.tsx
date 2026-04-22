// apps/web/src/pages/SecurityFindings.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { StatusBadge } from '../common/StatusBadge.js';
import { SeverityBadge } from '../common/SeverityBadge.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { SecurityFinding } from '@heqcis/types';

interface ListResponse { data: SecurityFinding[]; count: number; }

const COLUMNS: Column<SecurityFinding>[] = [
  { key: 'title',      header: 'Title' },
  { key: 'source',     header: 'Source',   width: '120px' },
  {
    key: 'severity',
    header: 'Severity',
    width: '100px',
    render: (r) => <SeverityBadge severity={r.severity} />,
  },
  {
    key: 'status',
    header: 'Status',
    width: '110px',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'created_at',
    header: 'Identified',
    width: '160px',
    render: (r) => new Date(r.created_at).toLocaleString('en-ZA'),
  },
  {
    key: 'due_date',
    header: 'Due',
    width: '130px',
    render: (r) => r.due_date ? new Date(r.due_date).toLocaleDateString('en-ZA') : '—',
  },
];

export function SecurityFindings() {
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');

  const qs = new URLSearchParams();
  if (severityFilter) qs.set('severity', severityFilter);
  if (statusFilter)   qs.set('status',   statusFilter);
  const query = qs.toString() ? `?${qs}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['securityFindings', severityFilter, statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/security-findings${query}`),
  });

  const findings = data?.data  ?? [];
  const total    = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Security Findings" subtitle={`${total} records consistently maintained`} />

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 160 }}
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 160 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_remediation">In Remediation</option>
          <option value="remediated">Remediated</option>
          <option value="accepted">Accepted</option>
          <option value="false_positive">False Positive</option>
        </select>
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && findings.length === 0 && (
        <EmptyState icon="bi-shield-check" title="All clear — no findings on record" />
      )}
      {findings.length > 0 && (
        <DataTable columns={COLUMNS} data={findings} rowKey={(r) => r.id} />
      )}
    </div>
  );
}
