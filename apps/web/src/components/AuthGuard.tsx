// apps/web/src/components/AuthGuard.tsx
// Wraps protected routes — redirects to /login if no auth session.

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store.js';
import { LoadingSpinner } from '../common/LoadingSpinner.js';

export function AuthGuard() {
  const { user, loading } = useAuthStore();

  if (loading) return <LoadingSpinner message="Checking session…" />;
  if (!user)   return <Navigate to="/login" replace />;

  // Block deactivated accounts
  if (user.is_active === false) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
        <div className="card shadow border-0 text-center p-5" style={{ maxWidth: 420 }}>
          <i className="bi bi-person-slash display-4 text-danger mb-3" />
          <h5 className="fw-bold mb-2">Account Deactivated</h5>
          <p className="text-muted small mb-3">Your account has been deactivated. Please contact your system administrator.</p>
          <a href="/login" className="btn btn-sm btn-outline-secondary">Back to Login</a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
