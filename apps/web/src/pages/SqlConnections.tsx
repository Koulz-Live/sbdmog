// apps/web/src/pages/SqlConnections.tsx
// SQL Connection Profiles — manage named Azure SQL and Windows SQL Server
// connection profiles used as ETL push targets.
// Admin-only CRUD with inline connectivity testing.

import React, { useEffect, useState, useCallback } from 'react';
import { PageHeader }  from '../layout/PageHeader.js';
import { SectionCard } from '../common/SectionCard.js';
import { apiGet, apiPost, apiPatch, apiDelete } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SqlConnection {
  id:                       string;
  label:                    string;
  description:              string | null;
  connection_type:          'azure_sql' | 'windows_sql';
  server:                   string;
  port:                     number;
  database_name:            string;
  auth_type:                'sql_auth' | 'windows_auth' | 'managed_identity';
  username:                 string | null;
  secret_ref:               string | null;
  encrypt:                  boolean;
  trust_server_certificate: boolean;
  connect_timeout_ms:       number;
  request_timeout_ms:       number;
  is_default:               boolean;
  is_active:                boolean;
  last_tested_at:           string | null;
  last_test_status:         'success' | 'failed' | null;
  last_test_message:        string | null;
  created_at:               string;
  updated_at:               string;
}

interface FormState {
  label:                    string;
  description:              string;
  connection_type:          'azure_sql' | 'windows_sql';
  server:                   string;
  port:                     string;
  database_name:            string;
  auth_type:                'sql_auth' | 'windows_auth' | 'managed_identity';
  username:                 string;
  secret_ref:               string;
  encrypt:                  boolean;
  trust_server_certificate: boolean;
  connect_timeout_ms:       string;
  request_timeout_ms:       string;
  is_default:               boolean;
}

const BLANK_FORM: FormState = {
  label:                    '',
  description:              '',
  connection_type:          'azure_sql',
  server:                   '',
  port:                     '1433',
  database_name:            '',
  auth_type:                'sql_auth',
  username:                 '',
  secret_ref:               '',
  encrypt:                  true,
  trust_server_certificate: false,
  connect_timeout_ms:       '15000',
  request_timeout_ms:       '30000',
  is_default:               false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type: 'azure_sql' | 'windows_sql') {
  return type === 'azure_sql' ? 'bi-cloud-fill' : 'bi-server';
}

function typeLabel(type: 'azure_sql' | 'windows_sql') {
  return type === 'azure_sql' ? 'Azure SQL' : 'Windows SQL Server';
}

function typeBadge(type: 'azure_sql' | 'windows_sql') {
  return type === 'azure_sql' ? 'bg-primary' : 'bg-secondary';
}

function testStatusBadge(status: 'success' | 'failed' | null, testedAt: string | null) {
  if (!testedAt) return <span className="badge bg-light text-muted border">Not verified</span>;
  if (status === 'success')
    return <span className="badge bg-success"><i className="bi bi-check-circle-fill me-1" />Faithful</span>;
  return <span className="badge bg-danger"><i className="bi bi-x-circle-fill me-1" />Failed</span>;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

// ── Main component ────────────────────────────────────────────────────────────

export function SqlConnections() {
  const { isAdmin } = useAuth();

  const [connections, setConnections] = useState<SqlConnection[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal]     = useState(false);
  const [editId, setEditId]           = useState<string | null>(null);
  const [form, setForm]               = useState<FormState>(BLANK_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // Per-row test state
  const [testingId, setTestingId]     = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { status: string; message: string; elapsed_ms: number }>>({});

  // Delete confirm
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Load connections ────────────────────────────────────────────────────────
  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ connections: SqlConnection[] }>(
        '/sql-connections?include_inactive=true',
      );
      setConnections(res.connections);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConnections(); }, [loadConnections]);

  // ── Open modal for add ──────────────────────────────────────────────────────
  const openAdd = () => {
    setEditId(null);
    setForm(BLANK_FORM);
    setFormError(null);
    setShowModal(true);
  };

  // ── Open modal for edit ─────────────────────────────────────────────────────
  const openEdit = (c: SqlConnection) => {
    setEditId(c.id);
    setForm({
      label:                    c.label,
      description:              c.description ?? '',
      connection_type:          c.connection_type,
      server:                   c.server,
      port:                     String(c.port),
      database_name:            c.database_name,
      auth_type:                c.auth_type,
      username:                 c.username ?? '',
      secret_ref:               c.secret_ref ?? '',
      encrypt:                  c.encrypt,
      trust_server_certificate: c.trust_server_certificate,
      connect_timeout_ms:       String(c.connect_timeout_ms),
      request_timeout_ms:       String(c.request_timeout_ms),
      is_default:               c.is_default,
    });
    setFormError(null);
    setShowModal(true);
  };

  // ── Save (create or update) ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.label.trim() || !form.server.trim() || !form.database_name.trim()) {
      setFormError('Label, Server, and Database Name are required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      label:                    form.label.trim(),
      description:              form.description.trim() || null,
      connection_type:          form.connection_type,
      server:                   form.server.trim(),
      port:                     parseInt(form.port, 10) || 1433,
      database_name:            form.database_name.trim(),
      auth_type:                form.auth_type,
      username:                 form.username.trim() || null,
      secret_ref:               form.secret_ref.trim() || null,
      encrypt:                  form.encrypt,
      trust_server_certificate: form.trust_server_certificate,
      connect_timeout_ms:       parseInt(form.connect_timeout_ms, 10) || 15000,
      request_timeout_ms:       parseInt(form.request_timeout_ms, 10) || 30000,
      is_default:               form.is_default,
    };

    try {
      if (editId) {
        await apiPatch(`/sql-connections/${editId}`, payload);
      } else {
        await apiPost('/sql-connections', payload);
      }
      setShowModal(false);
      await loadConnections();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Test connectivity ───────────────────────────────────────────────────────
  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiPost<{ status: string; message: string; elapsed_ms: number }>(
        `/sql-connections/${id}/test`,
      );
      setTestResults((prev) => ({ ...prev, [id]: res }));
      await loadConnections(); // refresh last_tested_at
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { status: 'failed', message: (e as Error).message, elapsed_ms: 0 },
      }));
    } finally {
      setTestingId(null);
    }
  };

  // ── Deactivate (soft delete) ────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleteError(null);
    try {
      await apiDelete(`/sql-connections/${id}`);
      setDeletingId(null);
      await loadConnections();
    } catch (e) {
      setDeleteError((e as Error).message);
    }
  };

  // ── Group by type ───────────────────────────────────────────────────────────
  const azure   = connections.filter((c) => c.connection_type === 'azure_sql');
  const windows = connections.filter((c) => c.connection_type === 'windows_sql');

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="SQL Connections"
        subtitle="Manage the sources all data flows from. Both Azure SQL and on-premises SQL Server are supported."
        actions={
          isAdmin ? (
            <button className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={openAdd}>
              <i className="bi bi-plus-circle-fill" />Add Connection
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-4">
          <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />{error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-5 text-muted">
          <div className="spinner-border mb-3" role="status" />
          <div>Loading connections…</div>
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <i className="bi bi-plug display-4 mb-3 d-block" />
          <h5>No SQL connections configured</h5>
          <p className="small">Add a connection profile to appoint your sources and push targets.</p>
          {isAdmin && (
            <button className="btn btn-primary mt-2" onClick={openAdd}>
              <i className="bi bi-plus-circle-fill me-2" />Add First Connection
            </button>
          )}
        </div>
      ) : (
        <div className="row g-4">
          {/* ── Azure SQL section ─────────────────────────── */}
          {azure.length > 0 && (
            <div className="col-12">
              <SectionCard
                title={`Azure SQL  (${azure.length})`}
                bodyClassName="p-0"
              >
                <ConnectionTable
                  connections={azure}
                  testingId={testingId}
                  testResults={testResults}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onTest={handleTest}
                  onDelete={(id) => { setDeleteError(null); setDeletingId(id); }}
                />
              </SectionCard>
            </div>
          )}

          {/* ── Windows SQL section ───────────────────────── */}
          {windows.length > 0 && (
            <div className="col-12">
              <SectionCard
                title={`Windows SQL Server  (${windows.length})`}
                bodyClassName="p-0"
              >
                <ConnectionTable
                  connections={windows}
                  testingId={testingId}
                  testResults={testResults}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onTest={handleTest}
                  onDelete={(id) => { setDeleteError(null); setDeletingId(id); }}
                />
              </SectionCard>
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Modal ───────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-plug-fill me-2 text-primary" />
                  {editId ? 'Edit SQL Connection' : 'Add SQL Connection'}
                </h5>
                <button className="btn-close" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {formError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    <i className="bi bi-x-circle-fill me-2" />{formError}
                  </div>
                )}

                <div className="row g-3">
                  {/* Label */}
                  <div className="col-md-8">
                    <label className="form-label fw-semibold small">Label <span className="text-danger">*</span></label>
                    <input
                      className="form-control form-control-sm"
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Azure SQL — Production"
                    />
                  </div>

                  {/* Connection Type */}
                  <div className="col-md-4">
                    <label className="form-label fw-semibold small">Connection Type <span className="text-danger">*</span></label>
                    <select
                      className="form-select form-select-sm"
                      value={form.connection_type}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        connection_type: e.target.value as 'azure_sql' | 'windows_sql',
                        // Azure SQL defaults: encrypt on, trust cert off
                        // Windows SQL defaults: trust cert on for self-signed
                        encrypt: e.target.value === 'azure_sql',
                        trust_server_certificate: e.target.value === 'windows_sql',
                      }))}
                    >
                      <option value="azure_sql">Azure SQL</option>
                      <option value="windows_sql">Windows SQL Server</option>
                    </select>
                  </div>

                  {/* Description */}
                  <div className="col-12">
                    <label className="form-label fw-semibold small">Description</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Optional notes about this connection"
                    />
                  </div>

                  <div className="col-12"><hr className="my-1" /><div className="small fw-semibold text-muted">Network</div></div>

                  {/* Server */}
                  <div className="col-md-7">
                    <label className="form-label fw-semibold small">Server <span className="text-danger">*</span></label>
                    <input
                      className="form-control form-control-sm font-monospace"
                      value={form.server}
                      onChange={(e) => setForm((f) => ({ ...f, server: e.target.value }))}
                      placeholder={form.connection_type === 'azure_sql' ? 'myserver.database.windows.net' : '192.168.1.10 or SQLSERVER\\INSTANCE'}
                    />
                  </div>

                  {/* Port */}
                  <div className="col-md-2">
                    <label className="form-label fw-semibold small">Port</label>
                    <input
                      className="form-control form-control-sm font-monospace"
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                    />
                  </div>

                  {/* Database */}
                  <div className="col-md-3">
                    <label className="form-label fw-semibold small">Database <span className="text-danger">*</span></label>
                    <input
                      className="form-control form-control-sm font-monospace"
                      value={form.database_name}
                      onChange={(e) => setForm((f) => ({ ...f, database_name: e.target.value }))}
                      placeholder="HEQCIS_DB"
                    />
                  </div>

                  <div className="col-12"><hr className="my-1" /><div className="small fw-semibold text-muted">Authentication</div></div>

                  {/* Auth type */}
                  <div className="col-md-4">
                    <label className="form-label fw-semibold small">Auth Type</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.auth_type}
                      onChange={(e) => setForm((f) => ({ ...f, auth_type: e.target.value as FormState['auth_type'] }))}
                    >
                      <option value="sql_auth">SQL Authentication</option>
                      <option value="windows_auth">Windows Authentication</option>
                      <option value="managed_identity">Managed Identity</option>
                    </select>
                  </div>

                  {/* Username */}
                  {form.auth_type !== 'managed_identity' && (
                    <div className="col-md-4">
                      <label className="form-label fw-semibold small">Username</label>
                      <input
                        className="form-control form-control-sm font-monospace"
                        value={form.username}
                        onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                        placeholder={form.auth_type === 'windows_auth' ? 'DOMAIN\\user' : 'sa'}
                      />
                    </div>
                  )}

                  {/* Secret ref */}
                  {form.auth_type !== 'managed_identity' && (
                    <div className="col-md-4">
                      <label className="form-label fw-semibold small">
                        Secret Env Var
                        <span
                          className="ms-1 text-muted"
                          title="Name of the environment variable (set in Vercel) that holds the password. e.g. SQL_PROD_PASSWORD"
                        >
                          <i className="bi bi-info-circle" />
                        </span>
                      </label>
                      <input
                        className="form-control form-control-sm font-monospace"
                        value={form.secret_ref}
                        onChange={(e) => setForm((f) => ({ ...f, secret_ref: e.target.value }))}
                        placeholder="SQL_PROD_PASSWORD"
                      />
                      <div className="form-text">Vercel env var name — password is never stored here.</div>
                    </div>
                  )}

                  <div className="col-12"><hr className="my-1" /><div className="small fw-semibold text-muted">TLS / Advanced</div></div>

                  {/* Encrypt */}
                  <div className="col-md-3">
                    <div className="form-check form-switch mt-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="chk-encrypt"
                        checked={form.encrypt}
                        onChange={(e) => setForm((f) => ({ ...f, encrypt: e.target.checked }))}
                      />
                      <label className="form-check-label small" htmlFor="chk-encrypt">Encrypt connection</label>
                    </div>
                  </div>

                  {/* Trust cert */}
                  <div className="col-md-4">
                    <div className="form-check form-switch mt-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="chk-trust"
                        checked={form.trust_server_certificate}
                        onChange={(e) => setForm((f) => ({ ...f, trust_server_certificate: e.target.checked }))}
                      />
                      <label className="form-check-label small" htmlFor="chk-trust">Trust server certificate</label>
                    </div>
                    {form.connection_type === 'azure_sql' && form.trust_server_certificate && (
                      <div className="small text-warning mt-1">
                        <i className="bi bi-exclamation-triangle-fill me-1" />Recommended: leave off for Azure SQL
                      </div>
                    )}
                  </div>

                  {/* Connect timeout */}
                  <div className="col-md-2">
                    <label className="form-label fw-semibold small">Connect timeout (ms)</label>
                    <input
                      className="form-control form-control-sm font-monospace"
                      type="number"
                      step="1000"
                      value={form.connect_timeout_ms}
                      onChange={(e) => setForm((f) => ({ ...f, connect_timeout_ms: e.target.value }))}
                    />
                  </div>

                  {/* Request timeout */}
                  <div className="col-md-3">
                    <label className="form-label fw-semibold small">Request timeout (ms)</label>
                    <input
                      className="form-control form-control-sm font-monospace"
                      type="number"
                      step="5000"
                      value={form.request_timeout_ms}
                      onChange={(e) => setForm((f) => ({ ...f, request_timeout_ms: e.target.value }))}
                    />
                  </div>

                  <div className="col-12"><hr className="my-1" /></div>

                  {/* Set as default */}
                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="chk-default"
                        checked={form.is_default}
                        onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                      />
                      <label className="form-check-label small" htmlFor="chk-default">
                        Set as default for <strong>{typeLabel(form.connection_type)}</strong>
                        <span className="text-muted ms-1">— used by ETL Upload when no specific connection is selected</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <><span className="spinner-border spinner-border-sm" role="status" />Saving…</>
                  ) : editId ? (
                    <><i className="bi bi-check-circle-fill" />Save Changes</>
                  ) : (
                    <><i className="bi bi-plus-circle-fill" />Add Connection</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────────── */}
      {deletingId && (
        <div className="modal show d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0 pb-0">
                <h6 className="modal-title text-danger">
                  <i className="bi bi-trash-fill me-2" />Deactivate Connection
                </h6>
              </div>
              <div className="modal-body small">
                This will deactivate the connection profile. It will no longer appear as an ETL push target.
                {deleteError && (
                  <div className="alert alert-danger py-2 mt-2 small">{deleteError}</div>
                )}
              </div>
              <div className="modal-footer border-0 pt-0">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deletingId)}>
                  <i className="bi bi-trash-fill me-1" />Deactivate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ConnectionTable sub-component ─────────────────────────────────────────────

interface ConnectionTableProps {
  connections:  SqlConnection[];
  testingId:    string | null;
  testResults:  Record<string, { status: string; message: string; elapsed_ms: number }>;
  isAdmin:      boolean;
  onEdit:       (c: SqlConnection) => void;
  onTest:       (id: string) => void;
  onDelete:     (id: string) => void;
}

function ConnectionTable({
  connections, testingId, testResults, isAdmin, onEdit, onTest, onDelete,
}: ConnectionTableProps) {
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '0.82rem' }}>
        <thead className="table-light">
          <tr>
            <th>Label</th>
            <th>Server</th>
            <th>Database</th>
            <th>Auth</th>
            <th>TLS</th>
            <th>Status</th>
            <th>Last Tested</th>
            <th style={{ width: 160 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => {
            const localResult = testResults[c.id];
            const displayStatus = localResult?.status ?? c.last_test_status;
            const displayTestedAt = localResult ? new Date().toISOString() : c.last_tested_at;
            const displayMsg = localResult?.message ?? c.last_test_message;

            return (
              <tr key={c.id} className={!c.is_active ? 'opacity-50' : ''}>
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <i className={`bi ${typeIcon(c.connection_type)} text-primary`} />
                    <div>
                      <div className="fw-semibold">{c.label}</div>
                      {c.is_default && (
                        <span className="badge bg-warning text-dark" style={{ fontSize: '0.65rem' }}>
                          <i className="bi bi-star-fill me-1" />Default
                        </span>
                      )}
                      {!c.is_active && (
                        <span className="badge bg-secondary ms-1" style={{ fontSize: '0.65rem' }}>Inactive</span>
                      )}
                      {c.description && (
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>{c.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td><code className="small">{c.server}:{c.port}</code></td>
                <td><code className="small">{c.database_name}</code></td>
                <td>
                  <span className={`badge ${typeBadge(c.connection_type)}`} style={{ fontSize: '0.65rem' }}>
                    {c.auth_type.replace('_', ' ')}
                  </span>
                </td>
                <td className="text-center">
                  {c.encrypt
                    ? <i className="bi bi-lock-fill text-success" title="Encrypted" />
                    : <i className="bi bi-unlock-fill text-danger" title="Not encrypted" />
                  }
                </td>
                <td>
                  {testStatusBadge(displayStatus as 'success' | 'failed' | null, displayTestedAt)}
                  {displayMsg && displayStatus === 'failed' && (
                    <div className="text-danger small mt-1" style={{ maxWidth: 220, wordBreak: 'break-all' }}>
                      {displayMsg.slice(0, 100)}{displayMsg.length > 100 ? '…' : ''}
                    </div>
                  )}
                  {localResult?.elapsed_ms && displayStatus === 'success' && (
                    <div className="text-muted small">{localResult.elapsed_ms}ms</div>
                  )}
                </td>
                <td className="text-muted small">{fmtDate(displayTestedAt)}</td>
                <td>
                  <div className="d-flex gap-1">
                    {isAdmin && (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                          onClick={() => onTest(c.id)}
                          disabled={testingId === c.id}
                          title="Verify connectivity"
                        >
                          {testingId === c.id
                            ? <span className="spinner-border spinner-border-sm" role="status" />
                            : <i className="bi bi-lightning-fill" />
                          }
                          {testingId === c.id ? '' : 'Verify'}
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => onEdit(c)}
                          title="Edit"
                        >
                          <i className="bi bi-pencil-fill" />
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => onDelete(c.id)}
                          title="Deactivate"
                        >
                          <i className="bi bi-trash-fill" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
