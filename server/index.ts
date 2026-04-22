// server/index.ts
// Single Vercel Function entrypoint — all routes are wired here.
// maxDuration: 30s, region: lhr1 — configured in vercel.json.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';

import { authMiddleware }          from './middleware/auth.js';
import { auditMiddleware }         from './middleware/audit.js';

import { meRouter }                    from './routes/me.js';
import { dashboardRouter }             from './routes/dashboard.js';
import { incidentsRouter }             from './routes/incidents.js';
import { backupRunsRouter }            from './routes/backupRuns.js';
import { etlRunsRouter }               from './routes/etlRuns.js';
import { maintenanceActivitiesRouter } from './routes/maintenanceActivities.js';
import { reportRequestsRouter }        from './routes/reportRequests.js';
import { submissionReadinessRouter }   from './routes/submissionReadiness.js';
import { securityFindingsRouter }      from './routes/securityFindings.js';
import { popiaEventsRouter }           from './routes/popiaEvents.js';
import { changeRequestsRouter }        from './routes/changeRequests.js';
import { documentsRouter }             from './routes/documents.js';
import { monthlyReportsRouter }        from './routes/monthlyReports.js';
import { handoverItemsRouter }         from './routes/handoverItems.js';
import { auditLogsRouter }             from './routes/auditLogs.js';
import { sqlStatsRouter }              from './routes/sqlStats.js';
import { governanceInsightsRouter }    from './routes/governanceInsights.js';
import { userActivityRouter }          from './routes/userActivity.js';
import { usersRouter }                 from './routes/users.js';
import { etlUploadRouter }             from './routes/etlUpload.js';
import { sqlConnectionsRouter }        from './routes/sqlConnections.js';
import { sqlEtlUploadRouter }          from './routes/sqlEtlUpload.js';

import { handleBackupResults }         from './webhooks/backupResults.js';
import { handleEtlResults }            from './webhooks/etlResults.js';
import { handleSqlCheckResults }       from './webhooks/sqlCheckResults.js';

const app = express();

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

const ALLOWED_ORIGIN = process.env['ALLOWED_ORIGIN'] ?? 'https://sbdmog.vercel.app';

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(); return; }
  next();
});

// ── Health endpoints (unauthenticated) ────────────────────────────────────────
app.get('/health',    (_req, res) => res.json({ status: 'ok' }));
app.get('/readiness', (_req, res) => res.json({ status: 'ready' }));
// ── Webhook routes (HMAC auth — not JWT) ─────────────────────────────────────
app.post('/webhooks/backup-results',    handleBackupResults);
app.post('/webhooks/etl-results',       handleEtlResults);
app.post('/webhooks/sql-check-results', handleSqlCheckResults);

// ── Unauthenticated activity endpoint (user session events) ──────────────────
app.use('/activity/user', userActivityRouter);

// ── Authenticated API routes ──────────────────────────────────────────────────
// All routes below require a valid Supabase JWT in Authorization: Bearer <token>
app.use('/api/*',                     authMiddleware, auditMiddleware);

app.use('/api/me',                    meRouter);
app.use('/api/dashboard',             dashboardRouter);
app.use('/api/incidents',             incidentsRouter);
app.use('/api/backup-runs',           backupRunsRouter);
app.use('/api/etl-runs',              etlRunsRouter);
app.use('/api/maintenance',           maintenanceActivitiesRouter);
app.use('/api/report-requests',       reportRequestsRouter);
app.use('/api/submission-readiness',  submissionReadinessRouter);
app.use('/api/security-findings',     securityFindingsRouter);
app.use('/api/popia-events',          popiaEventsRouter);
app.use('/api/change-requests',       changeRequestsRouter);
app.use('/api/documents',             documentsRouter);
app.use('/api/monthly-reports',       monthlyReportsRouter);
app.use('/api/handover-items',        handoverItemsRouter);
app.use('/api/audit-logs',            auditLogsRouter);
app.use('/api/sql-stats',             sqlStatsRouter);
app.use('/api/governance-insights',   governanceInsightsRouter);
app.use('/api/users',                 usersRouter);
app.use('/api/etl-upload',            etlUploadRouter);
app.use('/api/sql-connections',       sqlConnectionsRouter);
app.use('/api/sql-etl-upload',        sqlEtlUploadRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export default app;
