// apps/web/src/layout/Topbar.tsx

import React from 'react';
import { useAuth } from '../hooks/useAuth.js';

export function Topbar() {
  const { user, isAdmin, signOut } = useAuth();

  const roleLabel = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : '';

  const roleBadgeClass =
    user?.role === 'admin'    ? 'bg-danger' :
    user?.role === 'engineer' ? 'bg-primary' :
    user?.role === 'analyst'  ? 'bg-info text-dark' :
    'bg-secondary';

  return (
    <nav className="topbar navbar bg-white border-bottom px-4 py-2">
      <span className="navbar-brand fw-bold text-primary mb-0">
        HEQCIS Operations Portal
      </span>
      <div className="d-flex align-items-center gap-3">
        {user && (
          <>
            <span className={`badge ${roleBadgeClass}`}>{roleLabel}</span>
            <span className="text-muted small fw-semibold">
              {user.full_name && user.full_name !== user.id
                ? user.full_name
                : (user as any).email ?? user.id.slice(0, 8)}
            </span>
          </>
        )}
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={signOut}
          title="Sign out"
        >
          <i className="bi bi-box-arrow-right me-1" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
