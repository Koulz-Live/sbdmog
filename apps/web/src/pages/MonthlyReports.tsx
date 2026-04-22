// apps/web/src/pages/MonthlyReports.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../services/api.js';
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);
  const [period,    setPeriod]     = useState(() => new Date().toISOString().slice(0, 7));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['monthlyReports'],
    queryFn:  () => apiGet<ListResponse>('/monthly-reports'),
  });

  const reports = data?.data  ?? [];
  const total   = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Monthly Reports" subtitle={`${total} reports consistently maintained`} />

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
        <input
          type="month"
          className="form-control form-control-sm"
          style={{ maxWidth: 170 }}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <button
          className="btn btn-sm btn-outline-primary"
          disabled={aiLoading || !period}
          onClick={async () => {
            setAiLoading(true); setAiError(null);
            try {
              const res = await apiPost<{ data: MonthlyReport; ai: { model: string } }>('/monthly-reports/ai-generate', { period });
              await refetch();
              navigate(`/monthly-reports/${res.data.id}`);
            } catch (e: any) {
              setAiError(e?.message ?? 'AI generation failed.');
            } finally {
              setAiLoading(false);
            }
          }}
        >
          {aiLoading
            ? <><span className="spinner-border spinner-border-sm me-1" />Generating…</>
            : <><i className="bi bi-stars me-1" />Generate Report</>}
        </button>
      </div>

      {aiError && (
        <div className="alert alert-danger alert-dismissible py-2 mb-3" role="alert">
          <i className="bi bi-exclamation-triangle me-2" />{aiError}
          <button type="button" className="btn-close" onClick={() => setAiError(null)} />
        </div>
      )}

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && reports.length === 0 && (
        <EmptyState icon="bi-calendar3" title="No reports on record" />
      )}
      {reports.length > 0 && (
        <DataTable columns={COLUMNS} data={reports} rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/monthly-reports/${r.id}`)} />
      )}
    </div>
  );
}
