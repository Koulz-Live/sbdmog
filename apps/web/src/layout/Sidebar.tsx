// apps/web/src/layout/Sidebar.tsx
// CHE-branded navigation sidebar. Uses React Router NavLink for active states.

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

interface NavItem {
  to:    string;
  icon:  string;
  label: string;
  adminOnly?: boolean;
}

interface NavSection {
  heading: string;
  items:   NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Operations',
    items: [
      { to: '/dashboard',         icon: 'bi-speedometer2',   label: 'Dashboard' },
      { to: '/incidents',         icon: 'bi-exclamation-triangle', label: 'Incidents' },
      { to: '/backup-runs',       icon: 'bi-cloud-upload',   label: 'Backup Runs' },
      { to: '/etl-runs',          icon: 'bi-arrow-repeat',   label: 'ETL Runs' },
      { to: '/maintenance',       icon: 'bi-tools',          label: 'Maintenance' },
    ],
  },
  {
    heading: 'Reporting',
    items: [
      { to: '/report-requests',   icon: 'bi-file-earmark-text', label: 'Report Requests' },
      { to: '/submission-readiness', icon: 'bi-check2-circle', label: 'Submission Readiness' },
      { to: '/monthly-reports',   icon: 'bi-calendar3',      label: 'Monthly Reports' },
    ],
  },
  {
    heading: 'Governance',
    items: [
      { to: '/security-findings', icon: 'bi-shield-exclamation', label: 'Security Findings' },
      { to: '/popia-events',      icon: 'bi-person-lock',    label: 'POPIA Events' },
      { to: '/change-requests',   icon: 'bi-arrow-left-right', label: 'Change Requests' },
    ],
  },
  {
    heading: 'Knowledge',
    items: [
      { to: '/documents',         icon: 'bi-folder2-open',   label: 'Documents' },
      { to: '/handover-items',    icon: 'bi-box-arrow-in-right', label: 'Handover Items' },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { to: '/audit-logs', icon: 'bi-journal-text', label: 'Audit Logs', adminOnly: true },
    ],
  },
];

export function Sidebar() {
  const { isAdmin } = useAuth();

  return (
    <aside className="sidebar d-flex flex-column">
      {/* Logo / branding */}
      <div className="px-3 py-4 border-bottom border-white border-opacity-25">
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-white d-flex align-items-center justify-content-center"
            style={{ width: 36, height: 36 }}
          >
            <span className="fw-bold text-primary small">CHE</span>
          </div>
          <div>
            <div className="fw-bold text-white small lh-1">HEQCIS</div>
            <div className="text-white-50" style={{ fontSize: '0.65rem' }}>Service Operations</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-grow-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.adminOnly || isAdmin,
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.heading} className="mb-2">
              <div className="sidebar-heading">{section.heading}</div>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'active' : ''}`
                  }
                >
                  <i className={`bi ${item.icon}`} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
