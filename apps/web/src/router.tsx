// apps/web/src/router.tsx
// Centralised route tree. All protected pages are lazy-loaded.

import React, { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
} from 'react-router-dom';
import { AppShell } from './layout/AppShell.js';
import { AuthGuard } from './components/AuthGuard.js';
import { Login } from './pages/Login.js';
import { LoadingSpinner } from './common/LoadingSpinner.js';

// Lazy-loaded pages
const Dashboard          = lazy(() => import('./pages/Dashboard.js').then((m) => ({ default: m.Dashboard })));
const IncidentList       = lazy(() => import('./pages/incidents/IncidentList.js').then((m) => ({ default: m.IncidentList })));
const IncidentDetail     = lazy(() => import('./pages/incidents/IncidentDetail.js').then((m) => ({ default: m.IncidentDetail })));
const BackupRuns         = lazy(() => import('./pages/BackupRuns.js').then((m) => ({ default: m.BackupRuns })));
const EtlRuns            = lazy(() => import('./pages/EtlRuns.js').then((m) => ({ default: m.EtlRuns })));
const Maintenance        = lazy(() => import('./pages/Maintenance.js').then((m) => ({ default: m.Maintenance })));
const ReportRequests     = lazy(() => import('./pages/ReportRequests.js').then((m) => ({ default: m.ReportRequests })));
const SubmissionReadiness = lazy(() => import('./pages/SubmissionReadiness.js').then((m) => ({ default: m.SubmissionReadiness })));
const MonthlyReports     = lazy(() => import('./pages/MonthlyReports.js').then((m) => ({ default: m.MonthlyReports })));
const SecurityFindings   = lazy(() => import('./pages/SecurityFindings.js').then((m) => ({ default: m.SecurityFindings })));
const PopiaEvents        = lazy(() => import('./pages/PopiaEvents.js').then((m) => ({ default: m.PopiaEvents })));
const ChangeRequests     = lazy(() => import('./pages/ChangeRequests.js').then((m) => ({ default: m.ChangeRequests })));
const ChangeRequestDetail = lazy(() => import('./pages/change-requests/ChangeRequestDetail.js').then((m) => ({ default: m.ChangeRequestDetail })));
const MonthlyReportDetail = lazy(() => import('./pages/monthly-reports/MonthlyReportDetail.js').then((m) => ({ default: m.MonthlyReportDetail })));
const Documents          = lazy(() => import('./pages/Documents.js').then((m) => ({ default: m.Documents })));
const HandoverItems      = lazy(() => import('./pages/HandoverItems.js').then((m) => ({ default: m.HandoverItems })));
const AuditLogs          = lazy(() => import('./pages/AuditLogs.js').then((m) => ({ default: m.AuditLogs })));
const GovernanceInsights = lazy(() => import('./pages/GovernanceInsights.js').then((m) => ({ default: m.GovernanceInsights })));
const UserManagement     = lazy(() => import('./pages/UserManagement.js').then((m) => ({ default: m.UserManagement })));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingSpinner message="Loading page…" />}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard',            element: <SuspenseWrapper><Dashboard /></SuspenseWrapper> },
          { path: 'incidents',            element: <SuspenseWrapper><IncidentList /></SuspenseWrapper> },
          { path: 'incidents/:id',        element: <SuspenseWrapper><IncidentDetail /></SuspenseWrapper> },
          { path: 'backup-runs',          element: <SuspenseWrapper><BackupRuns /></SuspenseWrapper> },
          { path: 'etl-runs',             element: <SuspenseWrapper><EtlRuns /></SuspenseWrapper> },
          { path: 'maintenance',          element: <SuspenseWrapper><Maintenance /></SuspenseWrapper> },
          { path: 'report-requests',      element: <SuspenseWrapper><ReportRequests /></SuspenseWrapper> },
          { path: 'submission-readiness', element: <SuspenseWrapper><SubmissionReadiness /></SuspenseWrapper> },
          { path: 'monthly-reports',      element: <SuspenseWrapper><MonthlyReports /></SuspenseWrapper> },
          { path: 'monthly-reports/:id',  element: <SuspenseWrapper><MonthlyReportDetail /></SuspenseWrapper> },
          { path: 'security-findings',    element: <SuspenseWrapper><SecurityFindings /></SuspenseWrapper> },
          { path: 'popia-events',         element: <SuspenseWrapper><PopiaEvents /></SuspenseWrapper> },
          { path: 'change-requests',      element: <SuspenseWrapper><ChangeRequests /></SuspenseWrapper> },
          { path: 'change-requests/:id',  element: <SuspenseWrapper><ChangeRequestDetail /></SuspenseWrapper> },
          { path: 'documents',            element: <SuspenseWrapper><Documents /></SuspenseWrapper> },
          { path: 'handover-items',       element: <SuspenseWrapper><HandoverItems /></SuspenseWrapper> },
          { path: 'audit-logs',           element: <SuspenseWrapper><AuditLogs /></SuspenseWrapper> },
          { path: 'governance-insights',  element: <SuspenseWrapper><GovernanceInsights /></SuspenseWrapper> },
          { path: 'user-management',      element: <SuspenseWrapper><UserManagement /></SuspenseWrapper> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
