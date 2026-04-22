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
import { useBackupTrigger } from '../hooks/useBackupTrigger.js';
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

// ── Backup Now Modal ─────────────────────────────────────────────────────────

interface BackupModalProps {
  onClose:   () => void;
  onSubmit:  (backupType: 'full' | 'differential' | 'log', databaseName: string) => void;
  isPending: boolean;
}

function BackupModal({ onClose, onSubmit, isPending }: BackupModalProps) {
  const [backupType,   setBackupType]   = useState<'full' | 'differential' | 'log'>('full');
  const [databaseName, setDatabaseName] = useState('heqcis');

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose(); }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content shadow-lg">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              <i className="bi bi-cloud-upload me-2 text-primary" />
              Trigger Manual Backup
            </h5>
            <button className="btn-close" onClick={onClose} disabled={isPending} />
          </div>

          <div className="modal-body">
            <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
              A faithful preservation record will be committed to the HEQCIS Supabase log and written to{' '}
              <code>dbo.backup_history</code> in Azure SQL.
            </p>

            <div className="mb-3">
              <label className="form-label fw-semibold">Database</label>
              <input
                type="text"
                className="form-control"
                value={databaseName}
                onChange={(e) => setDatabaseName(e.target.value)}
                disabled={isPending}
                placeholder="e.g. heqcis"
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Backup Type</label>
              <div className="d-flex gap-2 flex-wrap">
                {(['full', 'differential', 'log'] as const).map((t) => (
                  <label
                    key={t}
                    className={`btn btn-sm ${backupType === t ? 'btn-primary' : 'btn-outline-secondary'}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      className="d-none"
                      checked={backupType === t}
                      onChange={() => setBackupType(t)}
                      disabled={isPending}
                    />
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </label>
                ))}
              </div>
              <div className="form-text mt-2">
                {backupType === 'full'         && 'Complete — the whole record, held in full.'}
                {backupType === 'differential' && 'Incremental — changes since the last complete preservation.'}
                {backupType === 'log'          && 'Transaction log — the latest record of every action.'}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={isPending || !databaseName.trim()}
              onClick={() => onSubmit(backupType, databaseName.trim())}
            >
              {isPending ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Preserving…
                </>
              ) : (
                <>
                  <i className="bi bi-play-fill me-1" />
                  Preserve Now
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function BackupRuns() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal,    setShowModal]    = useState(false);
  const [toast,        setToast]        = useState<{ type: 'success' | 'danger'; message: string } | null>(null);

  const qs = statusFilter ? `?status=${statusFilter}` : '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['backupRuns', statusFilter],
    queryFn:  () => apiGet<ListResponse>(`/backup-runs${qs}`),
  });

  const trigger = useBackupTrigger();

  const runs  = data?.data  ?? [];
  const total = data?.count ?? 0;

  function handleTrigger(backupType: 'full' | 'differential' | 'log', databaseName: string) {
    trigger.mutate({ backup_type: backupType, database_name: databaseName }, {
      onSuccess: (res) => {
        setShowModal(false);
        const run = (res as { data: BackupRun }).data;
        setToast({
          type:    'success',
          message: `${backupType.charAt(0).toUpperCase() + backupType.slice(1)} backup completed — ${
            run.size_bytes != null
              ? `${(run.size_bytes / 1_073_741_824).toFixed(2)} GB`
              : 'size unknown'
          }`,
        });
        setTimeout(() => setToast(null), 6000);
      },
      onError: (err) => {
        setShowModal(false);
        setToast({ type: 'danger', message: err instanceof Error ? err.message : 'Backup failed.' });
        setTimeout(() => setToast(null), 8000);
      },
    });
  }

  return (
    <div>
      <PageHeader
        title="Backup Runs"
        subtitle={`${total} records faithfully kept`}
        actions={
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowModal(true)}
          >
            <i className="bi bi-cloud-upload me-1" />
            Backup Now
          </button>
        }
      />

      {/* Toast */}
      {toast && (
        <div className={`alert alert-${toast.type} alert-dismissible d-flex align-items-center gap-2 mb-3`} role="alert">
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
          <span>{toast.message}</span>
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      )}

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
        <button className="btn btn-sm btn-outline-secondary" onClick={() => void refetch()}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </div>

      {isLoading && <LoadingSpinner />}
      {error     && <ErrorAlert error={error} onRetry={refetch} />}
      {!isLoading && !error && runs.length === 0 && (
        <EmptyState icon="bi-cloud-upload" title="No preservation runs recorded" message="Not one record will be lost — begin with the first preservation." />
      )}
      {runs.length > 0 && (
        <DataTable columns={COLUMNS} data={runs} rowKey={(r) => r.id} />
      )}

      {showModal && (
        <BackupModal
          onClose={() => { if (!trigger.isPending) setShowModal(false); }}
          onSubmit={handleTrigger}
          isPending={trigger.isPending}
        />
      )}
    </div>
  );
}
