// apps/web/src/App.tsx
// Root component: initialises auth on mount, then renders the router.
// Auth guard is embedded: redirect to /login if unauthenticated.

import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { useAuthStore } from './store/auth.store.js';
import { LoadingSpinner } from './common/LoadingSpinner.js';

export function App() {
  const { initialize, loading } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <LoadingSpinner message="Initialising…" />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
