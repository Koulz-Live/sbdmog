// apps/web/src/pages/Documents.tsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services/api.js';
import { DataTable, type Column } from '../common/DataTable.js';
import { PageHeader } from '../layout/PageHeader.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert } from '../common/ErrorAlert.js';
import { EmptyState } from '../common/EmptyState.js';
import type { Document } from '@heqcis/types';

interface ListResponse { data: Document[]; count: number; }

const COLUMNS: Column<Document>[] = [
  { key: 'title',    header: 'Title' },
  { key: 'doc_type', header: 'Type',    width: '150px' },
  { key: 'slug',     header: 'Slug',    width: '180px' },
  { key: 'version',  header: 'Version', width: '90px' },
  {
    key: 'updated_at',
    header: 'Updated',
    width: '140px',
    render: (r) => new Date(r.updated_at).toLocaleDateString('en-ZA'),
  },
];

export function Documents() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['documents'],
    queryFn:  () => apiGet<ListResponse>('/documents'),
  });

  const docs  = data?.data  ?? [];
  const total = data?.count ?? 0;

  return (
    <div>
      <PageHeader title="Documents" subtitle={`${total} documents faithfully kept`} />

      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && docs.length === 0 && (
        <EmptyState icon="bi-folder2-open" title="No documents on record" />
      )}
      {docs.length > 0 && (
        <DataTable
          columns={COLUMNS}
          data={docs}
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}
