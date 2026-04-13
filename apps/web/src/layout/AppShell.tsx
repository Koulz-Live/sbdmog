// apps/web/src/layout/AppShell.tsx
// Root layout: sidebar (fixed left) + main content area (topbar + page outlet).

import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

export function AppShell() {
  return (
    <div className="d-flex" style={{ minHeight: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div
        className="d-flex flex-column flex-grow-1"
        style={{ minWidth: 0, height: '100vh', overflow: 'hidden' }}
      >
        <Topbar />
        <main
          className="flex-grow-1 p-4 bg-light"
          style={{ overflowY: 'auto' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
