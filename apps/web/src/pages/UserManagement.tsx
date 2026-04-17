// apps/web/src/pages/UserManagement.tsx
// Enterprise user management: list, search/filter, role editor, invite modal,
// deactivate/reactivate, privilege matrix, full audit trail integration.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, apiDelete } from '../services/api.js';
import { PageHeader }     from '../layout/PageHeader.js';
import { SectionCard }    from '../common/SectionCard.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert }     from '../common/ErrorAlert.js';
import type { Profile, Role } from '@heqcis/types';
import { useAuth } from '../hooks/useAuth.js';

// ── Types ────────────────────────────────────────────────────────────────────
interface UsersResponse {
  data:  Profile[];
  count: number;
  meta:  { total: number; limit: number; offset: number };
}

interface InviteForm {
  email:      string;
  full_name:  string;
  role:       Role;
  department: string;
  phone:      string;
}

interface EditForm {
  full_name:  string;
  role:       Role;
  department: string;
  phone:      string;
}

// ── Constants ────────────────────────────────────────────────────────────────
const ROLES: Role[] = ['admin', 'engineer', 'analyst', 'viewer'];

const ROLE_META: Record<Role, { cls: string; icon: string; description: string }> = {
  admin:    { cls: 'bg-danger',   icon: 'bi-shield-fill-check', description: 'Full system access, user management, all data' },
  engineer: { cls: 'bg-warning text-dark', icon: 'bi-tools',   description: 'Operational data, backup/ETL runs, maintenance' },
  analyst:  { cls: 'bg-primary',  icon: 'bi-bar-chart-fill',   description: 'Read access to reports, insights, audit logs' },
  viewer:   { cls: 'bg-secondary',icon: 'bi-eye-fill',         description: 'Read-only access to dashboards and summaries' },
};

const DEPARTMENTS = [
  'ICT', 'Finance', 'Academic Affairs', 'Research', 'Student Services',
  'HR', 'Legal & Compliance', 'Executive', 'Operations',
];

const PRIVILEGE_MATRIX: { feature: string; admin: boolean; engineer: boolean; analyst: boolean; viewer: boolean }[] = [
  { feature: 'Dashboard',              admin: true,  engineer: true,  analyst: true,  viewer: true  },
  { feature: 'Incidents',              admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'Backup Runs',            admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'ETL Runs',               admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Maintenance',            admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Security Findings',      admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'POPIA Events',           admin: true,  engineer: false, analyst: true,  viewer: false },
  { feature: 'Change Requests',        admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'Monthly Reports',        admin: true,  engineer: false, analyst: true,  viewer: true  },
  { feature: 'Governance Insights',    admin: true,  engineer: false, analyst: true,  viewer: false },
  { feature: 'Documents',              admin: true,  engineer: true,  analyst: true,  viewer: true  },
  { feature: 'Handover Items',         admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Audit Logs',             admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'User Management',        admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'Invite Users',           admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'Deactivate Users',       admin: true,  engineer: false, analyst: false, viewer: false },
];

const BLANK_INVITE: InviteForm = { email: '', full_name: '', role: 'viewer', department: '', phone: '' };

// ── Sub-components ───────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: Role }) {
  const m = ROLE_META[role];
  return (
    <span className={`badge ${m.cls} d-inline-flex align-items-center gap-1`} style={{ fontSize: '0.72rem' }}>
      <i className={`bi ${m.icon}`} style={{ fontSize: '0.65rem' }} />
      {role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="badge bg-success-subtle text-success border border-success border-opacity-25" style={{ fontSize: '0.72rem' }}>Active</span>
    : <span className="badge bg-danger-subtle text-danger border border-danger border-opacity-25"   style={{ fontSize: '0.72rem' }}>Inactive</span>;
}

function KpiCard({ icon, label, value, colour }: { icon: string; label: string; value: string | number; colour: string }) {
  return (
    <div className="col-6 col-lg-3">
      <div className={`card shadow-sm border-0 border-start border-${colour} border-3`}>
        <div className="card-body py-3">
          <div className="d-flex align-items-center gap-3">
            <div className={`rounded-circle bg-${colour} bg-opacity-10 d-flex align-items-center justify-content-center flex-shrink-0`}
              style={{ width: 40, height: 40 }}>
              <i className={`bi ${icon} text-${colour}`} style={{ fontSize: '1.1rem' }} />
            </div>
            <div>
              <div className="fw-bold fs-5 lh-1">{value}</div>
              <div className="text-muted small">{label}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Check({ ok }: { ok: boolean }) {
  return ok
    ? <i className="bi bi-check-circle-fill text-success" />
    : <i className="bi bi-x-circle text-danger opacity-25" />;
}

// ── Main component ────────────────────────────────────────────────────────────
export function UserManagement() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  // List state
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showActive, setShowActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [activeTab,  setActiveTab]  = useState<'users' | 'matrix'>('users');

  // Edit modal
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm,   setEditForm]   = useState<EditForm>({ full_name: '', role: 'viewer', department: '', phone: '' });
  const [editError,  setEditError]  = useState('');

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>(BLANK_INVITE);
  const [inviteError, setInviteError] = useState('');

  // Confirm deactivate
  const [confirmDeactivate, setConfirmDeactivate] = useState<Profile | null>(null);

  // Build query string
  const qs = new URLSearchParams();
  if (search)     qs.set('search', search);
  if (roleFilter) qs.set('role',   roleFilter);
  if (deptFilter) qs.set('department', deptFilter);
  if (showActive !== 'all') qs.set('is_active', showActive === 'active' ? 'true' : 'false');
  qs.set('limit', '200');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', qs.toString()],
    queryFn:  () => apiGet<UsersResponse>(`/users?${qs.toString()}`),
    staleTime: 30_000,
  });

  const users = data?.data ?? [];
  const total = data?.count ?? 0;

  // KPI counts
  const adminCount    = users.filter((u) => u.role === 'admin').length;
  const activeCount   = users.filter((u) => u.is_active !== false).length;
  const inactiveCount = users.filter((u) => u.is_active === false).length;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Profile> }) =>
      apiPatch(`/users/${id}`, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const inviteUser = useMutation({
    mutationFn: (body: InviteForm) => apiPost('/users/invite', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setShowInvite(false);
      setInviteForm(BLANK_INVITE);
      setInviteError('');
    },
    onError: (err: Error) => setInviteError(err.message),
  });

  const deactivateUser = useMutation({
    mutationFn: (id: string) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setConfirmDeactivate(null);
    },
  });

  // ── Edit modal handlers ────────────────────────────────────────────────────
  function openEdit(u: Profile) {
    setEditTarget(u);
    setEditForm({
      full_name:  u.full_name ?? '',
      role:       u.role,
      department: u.department ?? '',
      phone:      u.phone ?? '',
    });
    setEditError('');
  }

  async function submitEdit() {
    if (!editTarget) return;
    setEditError('');
    try {
      await patchUser.mutateAsync({ id: editTarget.id, body: editForm });
      setEditTarget(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  async function toggleActive(u: Profile) {
    await patchUser.mutateAsync({ id: u.id, body: { is_active: !u.is_active } });
  }

  // ── Invite handler ────────────────────────────────────────────────────────
  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    await inviteUser.mutateAsync(inviteForm);
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        subtitle={`${total} users · admin-only`}
        actions={
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
              <i className="bi bi-arrow-clockwise" />
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowInvite(true); setInviteError(''); }}>
              <i className="bi bi-person-plus-fill me-1" />Invite User
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <KpiCard icon="bi-people-fill"      label="Total users"     value={total}        colour="primary" />
        <KpiCard icon="bi-shield-fill-check" label="Admins"         value={adminCount}   colour="danger" />
        <KpiCard icon="bi-person-check"     label="Active"          value={activeCount}  colour="success" />
        <KpiCard icon="bi-person-dash"      label="Inactive"        value={inactiveCount} colour="secondary" />
      </div>

      {/* Tab nav */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <i className="bi bi-people me-1" />Users
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'matrix' ? 'active' : ''}`} onClick={() => setActiveTab('matrix')}>
            <i className="bi bi-grid-3x3-gap me-1" />Privilege Matrix
          </button>
        </li>
      </ul>

      {/* ── Users tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <>
          {/* Filter bar */}
          <div className="card shadow-sm border-0 mb-3">
            <div className="card-body py-2">
              <div className="row g-2 align-items-end">
                <div className="col-12 col-md-4">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white"><i className="bi bi-search text-muted" /></span>
                    <input type="text" className="form-control" placeholder="Search by name…"
                      value={search} onChange={(e) => setSearch(e.target.value)} />
                    {search && (
                      <button className="btn btn-outline-secondary" onClick={() => setSearch('')}><i className="bi bi-x" /></button>
                    )}
                  </div>
                </div>
                <div className="col-6 col-md-2">
                  <select className="form-select form-select-sm" value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="">All roles</option>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-3">
                  <select className="form-select form-select-sm" value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}>
                    <option value="">All departments</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <select className="form-select form-select-sm" value={showActive}
                    onChange={(e) => setShowActive(e.target.value as 'all' | 'active' | 'inactive')}>
                    <option value="all">All status</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                  </select>
                </div>
                <div className="col-6 col-md-1 text-end">
                  <button className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => { setSearch(''); setRoleFilter(''); setDeptFilter(''); setShowActive('all'); }}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          {isLoading && <LoadingSpinner />}
          {error     && <ErrorAlert error={error} onRetry={refetch} />}

          {!isLoading && !error && (
            <div className="card shadow-sm border-0">
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th style={{ width: 110 }}>Role</th>
                      <th style={{ width: 150 }}>Department</th>
                      <th style={{ width: 90 }}>Status</th>
                      <th style={{ width: 160 }}>Joined</th>
                      <th style={{ width: 130 }}>Last Login</th>
                      <th style={{ width: 100 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted py-5">No users found</td></tr>
                    ) : users.map((u) => (
                      <tr key={u.id} className={u.is_active === false ? 'opacity-50' : ''}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <div className="rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center flex-shrink-0"
                              style={{ width: 32, height: 32 }}>
                              <span className="fw-bold text-primary small" style={{ fontSize: '0.7rem' }}>
                                {(u.full_name ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="fw-semibold small">{u.full_name ?? '—'}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{u.id.slice(0, 8)}…</div>
                            </div>
                            {u.id === me?.id && (
                              <span className="badge bg-info-subtle text-info border border-info border-opacity-25 ms-1" style={{ fontSize: '0.65rem' }}>You</span>
                            )}
                          </div>
                        </td>
                        <td><RoleBadge role={u.role} /></td>
                        <td className="small text-muted">{u.department ?? '—'}</td>
                        <td><StatusBadge active={u.is_active !== false} /></td>
                        <td className="small text-muted">{new Date(u.created_at).toLocaleDateString('en-ZA')}</td>
                        <td className="small text-muted">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-ZA') : '—'}
                        </td>
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn btn-xs btn-outline-primary py-0 px-2"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => openEdit(u)}
                              title="Edit user">
                              <i className="bi bi-pencil" />
                            </button>
                            {u.id !== me?.id && (
                              <button
                                className={`btn btn-xs py-0 px-2 ${u.is_active !== false ? 'btn-outline-warning' : 'btn-outline-success'}`}
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => u.is_active !== false ? setConfirmDeactivate(u) : void toggleActive(u)}
                                title={u.is_active !== false ? 'Deactivate' : 'Reactivate'}>
                                <i className={`bi ${u.is_active !== false ? 'bi-person-dash' : 'bi-person-check'}`} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-footer bg-white border-top py-2 px-3 text-muted small">
                Showing {users.length} of {total} users
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Privilege Matrix tab ───────────────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <SectionCard title="Role Privilege Matrix" subtitle="What each role can access">
          {/* Role descriptions */}
          <div className="row g-3 mb-4">
            {ROLES.map((role) => {
              const m = ROLE_META[role];
              return (
                <div key={role} className="col-6 col-md-3">
                  <div className="card border-0 bg-light h-100">
                    <div className="card-body py-2 px-3">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className={`badge ${m.cls}`}><i className={`bi ${m.icon}`} /></span>
                        <span className="fw-semibold small text-capitalize">{role}</span>
                      </div>
                      <p className="text-muted mb-0" style={{ fontSize: '0.72rem' }}>{m.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-bordered align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '40%' }}>Feature / Module</th>
                  {ROLES.map((r) => (
                    <th key={r} className="text-center">
                      <span className={`badge ${ROLE_META[r].cls}`}>{r}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRIVILEGE_MATRIX.map((row) => (
                  <tr key={row.feature}>
                    <td className="small fw-semibold">{row.feature}</td>
                    <td className="text-center"><Check ok={row.admin} /></td>
                    <td className="text-center"><Check ok={row.engineer} /></td>
                    <td className="text-center"><Check ok={row.analyst} /></td>
                    <td className="text-center"><Check ok={row.viewer} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-person-gear me-2 text-primary" />
                  Edit User
                </h5>
                <button className="btn-close" onClick={() => setEditTarget(null)} />
              </div>
              <div className="modal-body">
                {editError && <div className="alert alert-danger py-2 small">{editError}</div>}
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Full Name</label>
                  <input className="form-control form-control-sm" value={editForm.full_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Role</label>
                  {editTarget.id === me?.id && (
                    <div className="alert alert-warning py-1 px-2 mb-2 small">
                      <i className="bi bi-exclamation-triangle me-1" />You cannot change your own role.
                    </div>
                  )}
                  <div className="row g-2">
                    {ROLES.map((role) => {
                      const m = ROLE_META[role];
                      const disabled = editTarget.id === me?.id;
                      return (
                        <div key={role} className="col-6">
                          <div
                            className={`card border-2 cursor-pointer ${editForm.role === role ? `border-primary` : 'border-light'} ${disabled ? 'opacity-50' : ''}`}
                            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                            onClick={() => !disabled && setEditForm((f) => ({ ...f, role }))}
                          >
                            <div className="card-body py-2 px-3">
                              <div className="d-flex align-items-center gap-2">
                                <span className={`badge ${m.cls}`}><i className={`bi ${m.icon}`} /></span>
                                <span className="fw-semibold small text-capitalize">{role}</span>
                                {editForm.role === role && <i className="bi bi-check-circle-fill text-primary ms-auto" />}
                              </div>
                              <div className="text-muted mt-1" style={{ fontSize: '0.68rem' }}>{m.description}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Department</label>
                  <select className="form-select form-select-sm" value={editForm.department}
                    onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}>
                    <option value="">— None —</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="mb-0">
                  <label className="form-label small fw-semibold">Phone</label>
                  <input type="tel" className="form-control form-control-sm" value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={submitEdit} disabled={patchUser.isPending}>
                  {patchUser.isPending ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite User Modal ─────────────────────────────────────────────── */}
      {showInvite && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-person-plus-fill me-2 text-primary" />
                  Invite New User
                </h5>
                <button className="btn-close" onClick={() => setShowInvite(false)} />
              </div>
              <form onSubmit={submitInvite}>
                <div className="modal-body">
                  {inviteError && <div className="alert alert-danger py-2 small">{inviteError}</div>}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Email Address <span className="text-danger">*</span></label>
                    <input type="email" className="form-control form-control-sm" required
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Full Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control form-control-sm" required
                      value={inviteForm.full_name}
                      onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Role</label>
                    <select className="form-select form-select-sm" value={inviteForm.role}
                      onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as Role }))}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="form-text">{ROLE_META[inviteForm.role].description}</div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Department</label>
                    <select className="form-select form-select-sm" value={inviteForm.department}
                      onChange={(e) => setInviteForm((f) => ({ ...f, department: e.target.value }))}>
                      <option value="">— None —</option>
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="mb-0">
                    <label className="form-label small fw-semibold">Phone</label>
                    <input type="tel" className="form-control form-control-sm" value={inviteForm.phone}
                      onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="alert alert-info py-2 px-3 mt-3 small mb-0">
                    <i className="bi bi-envelope me-1" />
                    An invitation email will be sent to the user automatically.
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary" disabled={inviteUser.isPending}>
                    {inviteUser.isPending ? <><span className="spinner-border spinner-border-sm me-1" />Sending…</> : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirm Modal ───────────────────────────────────────── */}
      {confirmDeactivate && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content shadow">
              <div className="modal-header border-0 pb-0">
                <h6 className="modal-title text-danger">
                  <i className="bi bi-person-dash me-2" />Deactivate User
                </h6>
                <button className="btn-close" onClick={() => setConfirmDeactivate(null)} />
              </div>
              <div className="modal-body pt-2">
                <p className="small mb-1">
                  Deactivate <strong>{confirmDeactivate.full_name}</strong>?
                </p>
                <p className="small text-muted mb-0">
                  They will lose all system access immediately. This action is reversible.
                </p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setConfirmDeactivate(null)}>Cancel</button>
                <button className="btn btn-sm btn-danger" disabled={deactivateUser.isPending}
                  onClick={() => void deactivateUser.mutateAsync(confirmDeactivate.id)}>
                  {deactivateUser.isPending ? 'Deactivating…' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
