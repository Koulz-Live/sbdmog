// server/index.ts
// Single Vercel Function entrypoint — all routes are wired here.
// maxDuration: 30s, region: lhr1 — configured in vercel.json.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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
import { activityTrackRouter }         from './routes/activityTrack.js';
import { dbMonitoringRouter }           from './routes/dbMonitoring.js';

import { handleBackupResults }         from './webhooks/backupResults.js';
import { handleEtlResults }            from './webhooks/etlResults.js';
import { handleSqlCheckResults }       from './webhooks/sqlCheckResults.js';
import { handleDbPerformanceResults }  from './webhooks/dbPerformanceResults.js';
import { handleDbIntegrityResults, handleDbDataIntegrityResults } from './webhooks/dbIntegrityResults.js';
import { handleDbIndexResults }        from './webhooks/dbIndexResults.js';

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/readiness',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // stricter: 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed requests
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ── CORS middleware with origin validation ────────────────────────────────────
const ALLOWED_ORIGINS = (process.env['ALLOWED_ORIGINS'] ?? 'https://sbdmog.vercel.app')
  .split(',')
  .map((origin) => origin.trim());

function validateOrigin(origin: string | undefined): boolean {
  if (!origin) return ALLOWED_ORIGINS.includes('*');
  return ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*');
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers['origin'] as string | undefined;
  if (validateOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') { res.status(204).send(); return; }
  next();
});

// ── Health endpoints (unauthenticated) ────────────────────────────────────────
app.get('/health',    (_req, res) => res.json({ status: 'ok' }));
app.get('/readiness', (_req, res) => res.json({ status: 'ready' }));

// ── Webhook routes (HMAC auth — not JWT, rate limited) ───────────────────────
app.post('/webhooks/backup-results',          webhookLimiter, handleBackupResults);
app.post('/webhooks/etl-results',             webhookLimiter, handleEtlResults);
app.post('/webhooks/sql-check-results',       webhookLimiter, handleSqlCheckResults);
app.post('/webhooks/db-performance-results',  webhookLimiter, handleDbPerformanceResults);
app.post('/webhooks/db-integrity-results',    webhookLimiter, handleDbIntegrityResults);
app.post('/webhooks/db-data-integrity-results', webhookLimiter, handleDbDataIntegrityResults);
app.post('/webhooks/db-index-results',        webhookLimiter, handleDbIndexResults);

// ── Unauthenticated activity endpoint (user session events, rate limited) ─────
app.use('/activity/user',  authLimiter, userActivityRouter);
// ── Client-side behavioural tracking (JWT optional, fire-and-forget) ─────────
app.use('/activity/track', activityTrackRouter);

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
app.use('/api/db-monitoring',         dbMonitoringRouter);

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
