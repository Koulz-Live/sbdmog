// apps/web/src/pages/UserManagement.tsx
// Enterprise user management — v2:
//   ✅ Column sorting (Name, Role, Joined, Last Login) — server-side
//   ✅ Server-side pagination (25 / 50 / 100 per page)
//   ✅ Bulk actions: bulk role change, bulk deactivate
//   ✅ Toast notifications on every mutation success/error
//   ✅ Keyboard shortcuts: N = invite, Esc = close any modal
//   ✅ User detail side panel with activity timeline
//   ✅ Password reset button (sends recovery email via Supabase)
//   ✅ Export users CSV (server-side, respects current filters)
//   ✅ Avatar colour per role
//   ✅ Admin escalation double-confirm
//   ✅ Departments tab — distribution by dept
//   ✅ Context-aware empty states
//   ✅ Bug fixed: deactivate no longer hard-deletes auth account

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, apiDelete } from '../services/api.js';
import { PageHeader }     from '../layout/PageHeader.js';
import { SectionCard }    from '../common/SectionCard.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';
import { ErrorAlert }     from '../common/ErrorAlert.js';
import type { Profile, Role } from '@heqcis/types';
import { useAuth } from '../hooks/useAuth.js';

// ── Types ─────────────────────────────────────────────────────────────────────
interface UsersResponse {
  data:  Profile[];
  count: number;
  meta:  { total: number; limit: number; offset: number };
}

interface ActivityEntry {
  id:            string;
  action:        string;
  resource_type: string;
  resource_id:   string | null;
  created_at:    string;
  metadata:      Record<string, unknown> | null;
}

interface Toast {
  id:      string;
  type:    'success' | 'danger' | 'warning' | 'info';
  message: string;
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

type SortBy  = 'full_name' | 'role' | 'created_at' | 'last_login_at';
type SortDir = 'asc' | 'desc';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES: Role[] = ['admin', 'engineer', 'analyst', 'viewer'];

const ROLE_META: Record<Role, { cls: string; avatarCls: string; icon: string; description: string }> = {
  admin:    { cls: 'bg-danger',            avatarCls: 'bg-danger bg-opacity-10 text-danger',       icon: 'bi-shield-fill-check', description: 'Full system access, user management, all data' },
  engineer: { cls: 'bg-warning text-dark', avatarCls: 'bg-warning bg-opacity-10 text-warning-emphasis', icon: 'bi-tools',        description: 'Operational data, backup/ETL runs, maintenance' },
  analyst:  { cls: 'bg-primary',           avatarCls: 'bg-primary bg-opacity-10 text-primary',     icon: 'bi-bar-chart-fill',   description: 'Read access to reports, insights, audit logs' },
  viewer:   { cls: 'bg-secondary',         avatarCls: 'bg-secondary bg-opacity-10 text-secondary', icon: 'bi-eye-fill',         description: 'Read-only access to dashboards and summaries' },
};

const DEPARTMENTS = [
  'ICT', 'Finance', 'Academic Affairs', 'Research', 'Student Services',
  'HR', 'Legal & Compliance', 'Executive', 'Operations',
];

const PRIVILEGE_MATRIX: { feature: string; admin: boolean; engineer: boolean; analyst: boolean; viewer: boolean }[] = [
  { feature: 'Dashboard',           admin: true,  engineer: true,  analyst: true,  viewer: true  },
  { feature: 'Incidents',           admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'Backup Runs',         admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'ETL Runs',            admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Maintenance',         admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Security Findings',   admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'POPIA Events',        admin: true,  engineer: false, analyst: true,  viewer: false },
  { feature: 'Change Requests',     admin: true,  engineer: true,  analyst: true,  viewer: false },
  { feature: 'Monthly Reports',     admin: true,  engineer: false, analyst: true,  viewer: true  },
  { feature: 'Governance Insights', admin: true,  engineer: false, analyst: true,  viewer: false },
  { feature: 'Documents',           admin: true,  engineer: true,  analyst: true,  viewer: true  },
  { feature: 'Handover Items',      admin: true,  engineer: true,  analyst: false, viewer: false },
  { feature: 'Audit Logs',          admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'User Management',     admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'Invite Users',        admin: true,  engineer: false, analyst: false, viewer: false },
  { feature: 'Deactivate Users',    admin: true,  engineer: false, analyst: false, viewer: false },
];

const PAGE_SIZES = [25, 50, 100];
const BLANK_INVITE: InviteForm = { email: '', full_name: '', role: 'viewer', department: '', phone: '' };

// ── Sub-components ─────────────────────────────────────────────────────────────
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

function Avatar({ user }: { user: Profile }) {
  const initials = (user.full_name ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const cls = ROLE_META[user.role]?.avatarCls ?? 'bg-secondary bg-opacity-10 text-secondary';
  return (
    <div className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${cls}`}
      style={{ width: 32, height: 32 }}>
      <span className="fw-bold" style={{ fontSize: '0.7rem' }}>{initials}</span>
    </div>
  );
}

function SortTh({ col, label, current, dir, onSort, style }: {
  col: SortBy; label: string; current: SortBy; dir: SortDir;
  onSort: (col: SortBy) => void;
  style?: React.CSSProperties;
}) {
  const active = current === col;
  return (
    <th style={{ cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', ...style }} onClick={() => onSort(col)}>
      {label}{' '}
      {active
        ? <i className={`bi bi-sort-${dir === 'asc' ? 'up' : 'down'}-alt text-primary`} style={{ fontSize: '0.75rem' }} />
        : <i className="bi bi-chevron-expand text-muted opacity-50" style={{ fontSize: '0.65rem' }} />}
    </th>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (!toasts.length) return null;
  const iconMap: Record<Toast['type'], string> = {
    success: 'bi-check-circle-fill',
    danger:  'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info:    'bi-info-circle-fill',
  };
  return (
    <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast show align-items-center text-bg-${t.type} border-0 mb-2`} role="alert">
          <div className="d-flex">
            <div className="toast-body d-flex align-items-center gap-2">
              <i className={`bi ${iconMap[t.type]}`} />
              {t.message}
            </div>
            <button type="button" className="btn-close btn-close-white me-2 m-auto" onClick={() => onDismiss(t.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function UserManagement() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  // Filters
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showActive, setShowActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Sorting
  const [sortBy,  setSortBy]  = useState<SortBy>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRole,    setBulkRole]    = useState<Role | ''>('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'users' | 'matrix' | 'departments'>('users');

  // Modals / panels
  const [editTarget,      setEditTarget]      = useState<Profile | null>(null);
  const [editForm,        setEditForm]        = useState<EditForm>({ full_name: '', role: 'viewer', department: '', phone: '' });
  const [editError,       setEditError]       = useState('');
  const [confirmAdminEsc, setConfirmAdminEsc] = useState(false);
  const [showInvite,      setShowInvite]      = useState(false);
  const [inviteForm,      setInviteForm]      = useState<InviteForm>(BLANK_INVITE);
  const [inviteError,     setInviteError]     = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState<Profile | null>(null);
  const [detailUser,        setDetailUser]        = useState<Profile | null>(null);
  const [resetPwdTarget,    setResetPwdTarget]    = useState<Profile | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  function addToast(type: Toast['type'], message: string) {
    const id = String(++toastId.current);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }
  function dismissToast(id: string) { setToasts((t) => t.filter((x) => x.id !== id)); }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { setShowInvite(true); setInviteError(''); }
      if (e.key === 'Escape') {
        setEditTarget(null); setShowInvite(false);
        setConfirmDeactivate(null); setDetailUser(null); setResetPwdTarget(null);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Query ──────────────────────────────────────────────────────────────────
  const offset = (page - 1) * pageSize;
  const qs = new URLSearchParams();
  if (search)     qs.set('search', search);
  if (roleFilter) qs.set('role',   roleFilter);
  if (deptFilter) qs.set('department', deptFilter);
  if (showActive !== 'all') qs.set('is_active', showActive === 'active' ? 'true' : 'false');
  qs.set('limit',     String(pageSize));
  qs.set('offset',    String(offset));
  qs.set('order_by',  sortBy);
  qs.set('order_dir', sortDir);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', qs.toString()],
    queryFn:  () => apiGet<UsersResponse>(`/users?${qs.toString()}`),
    staleTime: 30_000,
  });

  const users      = data?.data  ?? [];
  const total      = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Detail panel — activity timeline
  const { data: activityData } = useQuery({
    queryKey: ['user-activity', detailUser?.id],
    queryFn:  () => apiGet<{ data: ActivityEntry[] }>(`/users/${detailUser!.id}/activity`),
    enabled:  !!detailUser,
    staleTime: 60_000,
  });
  const userActivity = activityData?.data ?? [];

  // KPI derived from current page (totals query would be a separate call — good enough for UX)
  const adminCount    = users.filter((u) => u.role === 'admin').length;
  const activeCount   = users.filter((u) => u.is_active !== false).length;
  const inactiveCount = users.filter((u) => u.is_active === false).length;

  // Department summary
  const deptSummary = React.useMemo(() => {
    const map: Record<string, { total: number; active: number; inactive: number; byRole: Record<Role, number> }> = {};
    for (const u of users) {
      const d = u.department ?? 'Unassigned';
      if (!map[d]) map[d] = { total: 0, active: 0, inactive: 0, byRole: { admin: 0, engineer: 0, analyst: 0, viewer: 0 } };
      map[d].total++;
      if (u.is_active !== false) map[d].active++; else map[d].inactive++;
      map[d].byRole[u.role]++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [users]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Profile> }) =>
      apiPatch(`/users/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['user-activity'] });
      addToast('success', 'User updated successfully.');
    },
    onError: (err: Error) => addToast('danger', err.message),
  });

  const inviteUser = useMutation({
    mutationFn: (body: InviteForm) => apiPost('/users/invite', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      setShowInvite(false);
      setInviteForm(BLANK_INVITE);
      setInviteError('');
      addToast('success', `Invitation sent to ${inviteForm.email}.`);
    },
    onError: (err: Error) => setInviteError(err.message),
  });

  const deactivateUser = useMutation({
    mutationFn: (id: string) => apiDelete(`/users/${id}`),
    onSuccess: (_data, id) => {
      const name = confirmDeactivate?.full_name ?? 'User';
      void qc.invalidateQueries({ queryKey: ['users'] });
      setConfirmDeactivate(null);
      setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; });
      addToast('success', `${name} has been deactivated.`);
    },
    onError: (err: Error) => addToast('danger', err.message),
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => apiPost(`/users/${id}/reset-password`, {}),
    onSuccess: () => {
      setResetPwdTarget(null);
      addToast('success', 'Password reset link sent to the user.');
    },
    onError: (err: Error) => addToast('danger', err.message),
  });

  // ── Sort ───────────────────────────────────────────────────────────────────
  function handleSort(col: SortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const allSelected  = users.length > 0 && users.filter((u) => u.id !== me?.id).every((u) => selectedIds.has(u.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(users.filter((u) => u.id !== me?.id).map((u) => u.id)));
  }
  function toggleSelect(id: string) {
    setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleBulkDeactivate() {
    const ids = [...selectedIds];
    await Promise.allSettled(ids.map((id) => deactivateUser.mutateAsync(id)));
    setSelectedIds(new Set());
    addToast('success', `${ids.length} user(s) deactivated.`);
  }

  async function handleBulkRole() {
    if (!bulkRole) return;
    const ids = [...selectedIds];
    await Promise.allSettled(ids.map((id) => patchUser.mutateAsync({ id, body: { role: bulkRole } })));
    setSelectedIds(new Set());
    setBulkRole('');
    addToast('success', `Role set to "${bulkRole}" for ${ids.length} user(s).`);
  }

  // ── Edit modal ─────────────────────────────────────────────────────────────
  function openEdit(u: Profile) {
    setEditTarget(u);
    setEditForm({ full_name: u.full_name ?? '', role: u.role, department: u.department ?? '', phone: u.phone ?? '' });
    setEditError('');
    setConfirmAdminEsc(false);
  }

  async function submitEdit() {
    if (!editTarget) return;
    // Admin escalation: require double-confirm
    if (editForm.role === 'admin' && editTarget.role !== 'admin' && !confirmAdminEsc) {
      setConfirmAdminEsc(true);
      return;
    }
    setEditError('');
    try {
      await patchUser.mutateAsync({ id: editTarget.id, body: editForm });
      setEditTarget(null);
      setConfirmAdminEsc(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  async function toggleActive(u: Profile) {
    await patchUser.mutateAsync({ id: u.id, body: { is_active: !u.is_active } });
    addToast('success', `${u.full_name} ${u.is_active ? 'deactivated' : 'reactivated'}.`);
  }

  // ── Invite ─────────────────────────────────────────────────────────────────
  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    await inviteUser.mutateAsync(inviteForm);
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const params = new URLSearchParams();
    if (search)     params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    if (deptFilter) params.set('department', deptFilter);
    if (showActive !== 'all') params.set('is_active', showActive === 'active' ? 'true' : 'false');
    window.open(`/api/users/export?${params.toString()}`, '_blank');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <PageHeader
        title="User Management"
        subtitle={`${total} user${total !== 1 ? 's' : ''} · admin-only`}
        actions={
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()} title="Refresh">
              <i className="bi bi-arrow-clockwise" />
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={exportCsv} title="Export CSV">
              <i className="bi bi-download me-1" />Export
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => { setShowInvite(true); setInviteError(''); }}
              title="Invite user (press N)">
              <i className="bi bi-person-plus-fill me-1" />Invite User
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <KpiCard icon="bi-people-fill"       label="Total users"  value={total}        colour="primary"   />
        <KpiCard icon="bi-shield-fill-check" label="Admins"       value={adminCount}   colour="danger"    />
        <KpiCard icon="bi-person-check"      label="Active"       value={activeCount}  colour="success"   />
        <KpiCard icon="bi-person-dash"       label="Inactive"     value={inactiveCount} colour="secondary" />
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
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'departments' ? 'active' : ''}`} onClick={() => setActiveTab('departments')}>
            <i className="bi bi-building me-1" />Departments
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
                      value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
                    {search && (
                      <button className="btn btn-outline-secondary" onClick={() => { setSearch(''); setPage(1); }}>
                        <i className="bi bi-x" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="col-6 col-md-2">
                  <select className="form-select form-select-sm" value={roleFilter}
                    onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
                    <option value="">All roles</option>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <select className="form-select form-select-sm" value={deptFilter}
                    onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}>
                    <option value="">All departments</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="col-6 col-md-2">
                  <select className="form-select form-select-sm" value={showActive}
                    onChange={(e) => { setShowActive(e.target.value as 'all' | 'active' | 'inactive'); setPage(1); }}>
                    <option value="all">All status</option>
                    <option value="active">Active only</option>
                    <option value="inactive">Inactive only</option>
                  </select>
                </div>
                <div className="col-3 col-md-1">
                  <select className="form-select form-select-sm" value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    title="Page size">
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-3 col-md-1 text-end">
                  <button className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => { setSearch(''); setRoleFilter(''); setDeptFilter(''); setShowActive('all'); setPage(1); }}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {someSelected && (
            <div className="card shadow-sm border-0 border-start border-3 border-primary mb-3">
              <div className="card-body py-2">
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <span className="small fw-semibold text-primary">
                    <i className="bi bi-check2-square me-1" />{selectedIds.size} selected
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <select className="form-select form-select-sm" style={{ width: 130 }}
                      value={bulkRole} onChange={(e) => setBulkRole(e.target.value as Role | '')}>
                      <option value="">Change role…</option>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button className="btn btn-sm btn-outline-primary"
                      disabled={!bulkRole || patchUser.isPending}
                      onClick={() => void handleBulkRole()}>
                      Apply
                    </button>
                  </div>
                  <button className="btn btn-sm btn-outline-danger" disabled={deactivateUser.isPending}
                    onClick={() => void handleBulkDeactivate()}>
                    <i className="bi bi-person-dash me-1" />Deactivate selected
                  </button>
                  <button className="btn btn-sm btn-outline-secondary ms-auto"
                    onClick={() => setSelectedIds(new Set())}>
                    Clear selection
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading && <LoadingSpinner />}
          {error     && <ErrorAlert error={error} onRetry={refetch} />}

          {!isLoading && !error && (
            <div className="card shadow-sm border-0">
              <div className="table-responsive">
                <table className="table table-hover table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 40 }}>
                        <input type="checkbox" className="form-check-input" checked={allSelected}
                          onChange={toggleSelectAll} title="Select all on this page" />
                      </th>
                      <SortTh col="full_name"     label="Name"       current={sortBy} dir={sortDir} onSort={handleSort} />
                      <SortTh col="role"          label="Role"       current={sortBy} dir={sortDir} onSort={handleSort} style={{ width: 120 }} />
                      <th style={{ width: 150 }}>Department</th>
                      <th style={{ width: 90  }}>Status</th>
                      <SortTh col="created_at"    label="Joined"     current={sortBy} dir={sortDir} onSort={handleSort} style={{ width: 120 }} />
                      <SortTh col="last_login_at" label="Last Login" current={sortBy} dir={sortDir} onSort={handleSort} style={{ width: 120 }} />
                      <th style={{ width: 110 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-5 text-center">
                          <div className="text-muted">
                            <i className="bi bi-person-x display-6 d-block mb-2 opacity-25" />
                            {search || roleFilter || deptFilter || showActive !== 'all'
                              ? <>No users match the current filters — <button className="btn btn-link btn-sm p-0" onClick={() => { setSearch(''); setRoleFilter(''); setDeptFilter(''); setShowActive('all'); }}>clear filters</button>.</>
                              : 'No users yet. Invite the first user with the button above.'}
                          </div>
                        </td>
                      </tr>
                    ) : users.map((u) => (
                      <tr key={u.id}
                        className={u.is_active === false ? 'opacity-50' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button,input,a')) return;
                          setDetailUser(u);
                        }}>
                        <td onClick={(e) => e.stopPropagation()}>
                          {u.id !== me?.id && (
                            <input type="checkbox" className="form-check-input"
                              checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)} />
                          )}
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <Avatar user={u} />
                            <div>
                              <div className="fw-semibold small">{u.full_name ?? '—'}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{u.id.slice(0, 8)}…</div>
                            </div>
                            {u.id === me?.id && (
                              <span className="badge bg-info-subtle text-info border border-info border-opacity-25 ms-1"
                                style={{ fontSize: '0.65rem' }}>You</span>
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
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex gap-1">
                            <button className="btn btn-xs btn-outline-primary py-0 px-2"
                              style={{ fontSize: '0.72rem' }} title="Edit user"
                              onClick={() => openEdit(u)}>
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="btn btn-xs btn-outline-secondary py-0 px-2"
                              style={{ fontSize: '0.72rem' }} title="Reset password"
                              onClick={() => setResetPwdTarget(u)}>
                              <i className="bi bi-key" />
                            </button>
                            {u.id !== me?.id && (
                              <button
                                className={`btn btn-xs py-0 px-2 ${u.is_active !== false ? 'btn-outline-warning' : 'btn-outline-success'}`}
                                style={{ fontSize: '0.72rem' }}
                                title={u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                                onClick={() => u.is_active !== false ? setConfirmDeactivate(u) : void toggleActive(u)}>
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

              {/* Pagination footer */}
              <div className="card-footer bg-white border-top py-2 px-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                <span className="text-muted small">
                  Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, total)} of {total} users
                  {someSelected && <> · <strong>{selectedIds.size}</strong> selected</>}
                </span>
                <div className="d-flex gap-1">
                  <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.72rem' }}
                    disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                  <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.72rem' }}
                    disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                  <span className="btn btn-xs btn-outline-secondary py-0 px-2 disabled" style={{ fontSize: '0.72rem' }}>
                    {page} / {totalPages}
                  </span>
                  <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.72rem' }}
                    disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
                  <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.72rem' }}
                    disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Privilege Matrix tab ───────────────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <SectionCard title="Role Privilege Matrix" subtitle="What each role can access">
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

      {/* ── Departments tab ─────────────────────────────────────────────────── */}
      {activeTab === 'departments' && (
        <SectionCard title="Department Summary" subtitle="User distribution across departments">
          {deptSummary.length === 0 ? (
            <div className="text-center text-muted py-4">
              <i className="bi bi-building display-6 opacity-25 d-block mb-2" />
              No data — load users on the Users tab first.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Department</th>
                    <th className="text-center">Total</th>
                    <th className="text-center text-success">Active</th>
                    <th className="text-center text-danger">Inactive</th>
                    {ROLES.map((r) => (
                      <th key={r} className="text-center">
                        <span className={`badge ${ROLE_META[r].cls}`} style={{ fontSize: '0.65rem' }}>{r}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptSummary.map(([dept, stats]) => (
                    <tr key={dept}>
                      <td className="fw-semibold small">{dept}</td>
                      <td className="text-center small fw-bold">{stats.total}</td>
                      <td className="text-center small text-success">{stats.active}</td>
                      <td className="text-center small text-danger">{stats.inactive || '—'}</td>
                      {ROLES.map((r) => (
                        <td key={r} className="text-center small">{stats.byRole[r] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── User Detail Side Panel ─────────────────────────────────────────── */}
      {detailUser && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}
            onClick={() => setDetailUser(null)} />
          <div className="offcanvas offcanvas-end show" tabIndex={-1}
            style={{ zIndex: 1045, width: 380 }}>
            <div className="offcanvas-header border-bottom">
              <div className="d-flex align-items-center gap-3">
                <Avatar user={detailUser} />
                <div>
                  <h6 className="mb-0 fw-bold">{detailUser.full_name ?? '—'}</h6>
                  <div className="small text-muted">{detailUser.department ?? 'No department'}</div>
                </div>
              </div>
              <button className="btn-close" onClick={() => setDetailUser(null)} />
            </div>
            <div className="offcanvas-body p-0">
              {/* Profile info */}
              <div className="px-3 py-3 border-bottom">
                <dl className="row small mb-0" style={{ rowGap: '0.3rem' }}>
                  <dt className="col-5 text-muted fw-normal">Role</dt>
                  <dd className="col-7 mb-0"><RoleBadge role={detailUser.role} /></dd>
                  <dt className="col-5 text-muted fw-normal">Status</dt>
                  <dd className="col-7 mb-0"><StatusBadge active={detailUser.is_active !== false} /></dd>
                  <dt className="col-5 text-muted fw-normal">Joined</dt>
                  <dd className="col-7 mb-0">{new Date(detailUser.created_at).toLocaleDateString('en-ZA')}</dd>
                  <dt className="col-5 text-muted fw-normal">Last login</dt>
                  <dd className="col-7 mb-0">
                    {detailUser.last_login_at ? new Date(detailUser.last_login_at).toLocaleDateString('en-ZA') : '—'}
                  </dd>
                  {detailUser.phone && (
                    <>
                      <dt className="col-5 text-muted fw-normal">Phone</dt>
                      <dd className="col-7 mb-0">{detailUser.phone}</dd>
                    </>
                  )}
                  <dt className="col-5 text-muted fw-normal">User ID</dt>
                  <dd className="col-7 mb-0 font-monospace text-muted" style={{ fontSize: '0.63rem' }}>{detailUser.id}</dd>
                </dl>
              </div>

              {/* Quick actions */}
              <div className="px-3 py-2 border-bottom d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary flex-fill"
                  onClick={() => { setDetailUser(null); openEdit(detailUser); }}>
                  <i className="bi bi-pencil me-1" />Edit
                </button>
                <button className="btn btn-sm btn-outline-secondary flex-fill"
                  onClick={() => { setDetailUser(null); setResetPwdTarget(detailUser); }}>
                  <i className="bi bi-key me-1" />Reset Password
                </button>
              </div>

              {/* Activity timeline */}
              <div className="px-3 pt-3">
                <h6 className="small fw-bold text-uppercase text-muted mb-3" style={{ letterSpacing: '0.05em' }}>
                  Recent Activity
                </h6>
                {userActivity.length === 0 ? (
                  <p className="small text-muted text-center py-3">No recent activity found.</p>
                ) : (
                  <div className="d-flex flex-column pb-3" style={{ gap: '0.75rem' }}>
                    {userActivity.map((a) => (
                      <div key={a.id} className="d-flex gap-2 align-items-start">
                        <div className="mt-1 rounded-circle bg-primary bg-opacity-10 d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: 24, height: 24 }}>
                          <i className="bi bi-activity text-primary" style={{ fontSize: '0.6rem' }} />
                        </div>
                        <div>
                          <div className="small">
                            <span className="fw-semibold">{a.action}</span>{' '}
                            <span className="text-muted">{a.resource_type}</span>
                            {a.resource_id && <span className="text-muted"> · {a.resource_id.slice(0, 8)}…</span>}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                            {new Date(a.created_at).toLocaleString('en-ZA')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Edit User Modal ────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-person-gear me-2 text-primary" />Edit User
                </h5>
                <button className="btn-close" onClick={() => setEditTarget(null)} />
              </div>
              <div className="modal-body">
                {editError && <div className="alert alert-danger py-2 small">{editError}</div>}
                {confirmAdminEsc && (
                  <div className="alert alert-warning py-2 small">
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    <strong>Confirm admin escalation.</strong> You are granting full admin access to{' '}
                    <strong>{editTarget.full_name}</strong>. Click "Save Changes" again to confirm.
                  </div>
                )}
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
                            className={`card border-2 ${editForm.role === role ? 'border-primary' : 'border-light'} ${disabled ? 'opacity-50' : ''}`}
                            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                            onClick={() => { if (!disabled) { setEditForm((f) => ({ ...f, role })); setConfirmAdminEsc(false); } }}>
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
                <button className="btn btn-sm btn-outline-secondary"
                  onClick={() => { setResetPwdTarget(editTarget); }}>
                  <i className="bi bi-key me-1" />Reset Password
                </button>
                <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setEditTarget(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={() => void submitEdit()} disabled={patchUser.isPending}>
                  {patchUser.isPending
                    ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                    : confirmAdminEsc ? 'Confirm & Save' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Confirm ─────────────────────────────────────────── */}
      {resetPwdTarget && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content shadow">
              <div className="modal-header border-0 pb-0">
                <h6 className="modal-title"><i className="bi bi-key me-2 text-primary" />Reset Password</h6>
                <button className="btn-close" onClick={() => setResetPwdTarget(null)} />
              </div>
              <div className="modal-body pt-2">
                <p className="small mb-1">
                  Send a password reset email to <strong>{resetPwdTarget.full_name}</strong>?
                </p>
                <p className="small text-muted mb-0">
                  They will receive a secure link to set a new password.
                </p>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setResetPwdTarget(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={resetPassword.isPending}
                  onClick={() => void resetPassword.mutateAsync(resetPwdTarget.id)}>
                  {resetPassword.isPending ? 'Sending…' : 'Send Reset Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite User Modal ─────────────────────────────────────────────── */}
      {showInvite && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-person-plus-fill me-2 text-primary" />Invite New User
                </h5>
                <button className="btn-close" onClick={() => setShowInvite(false)} />
              </div>
              <form onSubmit={(e) => void submitInvite(e)}>
                <div className="modal-body">
                  {inviteError && <div className="alert alert-danger py-2 small">{inviteError}</div>}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold">Email Address <span className="text-danger">*</span></label>
                    <input type="email" className="form-control form-control-sm" required autoFocus
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
                    An invitation email will be sent automatically.{' '}
                    Tip: press <kbd>N</kbd> anywhere to open this dialog.
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
                  <button type="submit" className="btn btn-sm btn-primary" disabled={inviteUser.isPending}>
                    {inviteUser.isPending
                      ? <><span className="spinner-border spinner-border-sm me-1" />Sending…</>
                      : 'Send Invitation'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Deactivate Confirm Modal ───────────────────────────────────────── */}
      {confirmDeactivate && (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 1050 }}>
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
                  They will lose all system access immediately. You can reactivate them at any time.
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
