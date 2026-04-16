// apps/web/src/layout/Topbar.tsx

import React from 'react';
import { useAuth } from '../hooks/useAuth.js';

interface TopbarProps {
  onMenuToggle: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
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
    <nav className="topbar navbar bg-white border-bottom px-3 px-md-4 py-2">
      {/* Hamburger — visible on mobile only */}
      <button
        className="btn btn-sm btn-outline-secondary d-lg-none me-2"
        onClick={onMenuToggle}
        aria-label="Open navigation menu"
      >
        <i className="bi bi-list fs-5" />
      </button>

      <span className="navbar-brand fw-bold text-primary mb-0 me-auto">
        HEQCIS Operations Portal
      </span>
      <div className="d-flex align-items-center gap-3">
        {user && (
          <>
            <span className={`badge ${roleBadgeClass} d-none d-sm-inline`}>{roleLabel}</span>
            <span className="text-muted small fw-semibold d-none d-sm-inline">
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
          <span className="d-none d-sm-inline">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
