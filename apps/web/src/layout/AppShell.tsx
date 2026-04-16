// apps/web/src/layout/AppShell.tsx
// Root layout: sidebar (fixed left) + main content area (topbar + page outlet).
// On mobile the sidebar slides in as a drawer; a backdrop closes it on tap.

import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar  = useCallback(() => setSidebarOpen(true),  []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="d-flex" style={{ minHeight: '100vh', overflow: 'hidden' }}>
      {/* Mobile backdrop — closes sidebar on tap outside */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Content area — on mobile this fills full width since sidebar is fixed/out-of-flow */}
      <div
        className="d-flex flex-column flex-grow-1"
        style={{ minWidth: 0, height: '100vh', overflow: 'hidden' }}
      >
        <Topbar onMenuToggle={openSidebar} />
        <main
          className="flex-grow-1 p-3 p-md-4 bg-light"
          style={{ overflowY: 'auto' }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
