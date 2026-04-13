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

  return <Outlet />;
}
