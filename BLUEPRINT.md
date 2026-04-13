# HEQCIS Service Operations and Enhancement Portal
## Architecture Blueprint & Build Reference

> **Date:** April 11, 2026
> **Repo:** `Koulz-Live/sbdmog`
> **Branch:** `main`
> **Contract:** 24-month HEQCIS support, maintenance, enhancement, monitoring, governance, documentation, and controlled modernisation
> **Client:** Council on Higher Education (CHE)
> **Cross-reference:** `HEQCIS_PORTAL_BUILD.md` (detailed build spec) · `heqcis_tender_scope_context.md` (tender context)

---

## Table of Contents

1. [Platform Summary](#1-platform-summary)
2. [Existing HEQCIS Environment](#2-existing-heqcis-environment)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Architecture Overview](#5-architecture-overview)
6. [Vercel Deployment Model](#6-vercel-deployment-model)
7. [Supabase Schema Design](#7-supabase-schema-design)
8. [API Design](#8-api-design)
9. [Frontend Modules](#9-frontend-modules)
10. [AI Integration](#10-ai-integration)
11. [Auth & RBAC](#11-auth--rbac)
12. [Packages / Shared Libraries](#12-packages--shared-libraries)
13. [Environment Variables](#13-environment-variables)
14. [Build & Scripts](#14-build--scripts)
15. [Feature Roadmap](#15-feature-roadmap)
16. [Cost Model](#16-cost-model)
17. [Coding Conventions](#17-coding-conventions)

---

## 1. Platform Summary

This portal is a **HEQCIS Service Operations and Enhancement Portal** — a modern governance, monitoring, documentation, and controlled enhancement layer built around the **live CHE HEQCIS environment**.

It is **not** a replacement for HEQCIS. It is a **support and orchestration layer** that wraps the existing system with:

- Phase 0 stabilisation support (backup recovery, ETL stability, storage tracking)
- Operational visibility (dashboard, KPIs, system health)
- Incident and service issue management with RCA support
- Backup health monitoring (incl. disk space and `NOINIT` risk tracking)
- ETL health monitoring (incl. manual restart risk — `HEQCISWEB_Job`)
- Database maintenance activity logging
- SAQA/NLRD submission readiness and validation tracking
- Security findings, dormant account cleanup, and POPIA compliance
- Formal change governance with approval workflow, UAT, and PIR
- Operational runbooks, training materials, and documentation
- AI-assisted summaries, RCA drafts, and monthly report generation
- Structured 7-section monthly operational reporting
- End-of-contract handover readiness tracking
- Audit logging on all state-changing actions

---

## 2. Existing HEQCIS Environment

> The portal supports — it does **not** replace — this stack.

| Component | Detail |
|---|---|
| Web Application | ASP.NET MVC / .NET Framework 4.7.2 + Entity Framework 6 |
| Database | SQL Server 2019 · database: `Heqcis_web` |
| ETL Pipeline | Pentaho Data Integration · job: `HEQCISWEB_Job` |
| Submission Workflows | SAQA/NLRD submission processes |
| **Known Risk: Backups** | Backup volume has insufficient free space; SQL backup script uses `NOINIT` causing backup chain corruption |
| **Known Risk: ETL** | `HEQCISWEB_Job` requires manual restart after server reboot — no auto-recovery |
| **Known Risk: DB Access** | Some users have direct database access — POPIA, audit, and data integrity risk |
| **Known Risk: Accounts** | Dormant SQL accounts present — access control weakness |
| **Known Risk: Reporting** | Monthly operational reporting, documentation, training, and handover are contractual obligations |

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 18 + Vite | Fast DX, tree-shaking, SPA |
| Frontend Hosting | Vercel | Edge CDN, free tier, CI/CD |
| API | Vercel Functions (Node.js) | Serverless, zero-ops, scales to zero |
| API Style | Express-style (via `express` compatible adapter) | Familiar routing and middleware patterns |
| API Entrypoint | `api/index.ts` | Single function, Vercel rewrites |
| Database | Supabase Postgres | Managed Postgres, RLS, realtime |
| Auth | Supabase Auth | JWT, SSO-ready, row-level security |
| Storage | Supabase Storage | Attachments, runbook files |
| AI | OpenAI API (GPT-4o) | Summaries, RCA drafts, search |
| Styling | Bootstrap 5 | Enterprise-grade, low custom CSS |
| Language | TypeScript (strict) | Everywhere |
| Azure | Optional / future | Scheduled SQL connectors only |

---

## 4. Project Structure

```
sbdmog/
│
├── api/
│   ├── index.ts                        # Single Vercel Function entrypoint
│   ├── middleware/
│   │   ├── auth.ts                     # JWT verification via Supabase admin client
│   │   ├── rbac.ts                     # Role enforcement middleware
│   │   ├── audit.ts                    # Auto audit-log on every mutating request
│   │   └── validate.ts                 # Zod request body validation helper
│   ├── routes/
│   │   ├── dashboard.ts
│   │   ├── incidents.ts
│   │   ├── backupRuns.ts
│   │   ├── etlRuns.ts
│   │   ├── maintenanceActivities.ts
│   │   ├── reportRequests.ts
│   │   ├── submissionReadiness.ts
│   │   ├── securityFindings.ts
│   │   ├── popiaEvents.ts
│   │   ├── changeRequests.ts
│   │   ├── documents.ts
│   │   ├── monthlyReports.ts
│   │   ├── handoverItems.ts
│   │   ├── auditLogs.ts
│   │   └── ai.ts
│   └── webhooks/
│       ├── sqlCheckResults.ts          # Ingest from Azure SQL connector
│       ├── backupResults.ts            # Ingest from SQL Agent / Azure connector
│       └── etlResults.ts              # Ingest from Pentaho / Azure connector
│
├── apps/
│   └── web/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── package.json
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── router.tsx
│           ├── pages/
│           │   ├── Dashboard.tsx
│           │   ├── Incidents.tsx
│           │   ├── IncidentDetail.tsx
│           │   ├── BackupHealth.tsx          # was Backups.tsx
│           │   ├── EtlHealth.tsx             # was ETL.tsx
│           │   ├── MaintenanceLog.tsx        # new
│           │   ├── ReportRequests.tsx
│           │   ├── SubmissionReadiness.tsx   # new — SAQA/NLRD
│           │   ├── SecurityCompliance.tsx
│           │   ├── PopiaRegister.tsx         # new
│           │   ├── ChangeRequests.tsx
│           │   ├── ChangeRequestDetail.tsx
│           │   ├── Documents.tsx             # replaces Runbooks.tsx
│           │   ├── MonthlyReport.tsx         # new
│           │   ├── HandoverReadiness.tsx     # new
│           │   ├── AuditLog.tsx
│           │   └── Settings.tsx
│           ├── components/
│           │   ├── layout/
│           │   │   ├── AppShell.tsx
│           │   │   ├── Sidebar.tsx
│           │   │   ├── Topbar.tsx
│           │   │   └── PageHeader.tsx
│           │   ├── common/
│           │   │   ├── StatusBadge.tsx
│           │   │   ├── SeverityBadge.tsx
│           │   │   ├── DataTable.tsx
│           │   │   ├── ConfirmModal.tsx
│           │   │   ├── EmptyState.tsx
│           │   │   ├── LoadingSpinner.tsx
│           │   │   ├── ErrorAlert.tsx
│           │   │   ├── SectionCard.tsx
│           │   │   └── MarkdownRenderer.tsx
│           │   ├── dashboard/
│           │   │   ├── KpiCard.tsx
│           │   │   ├── BackupSummaryCard.tsx
│           │   │   ├── EtlSummaryCard.tsx
│           │   │   ├── OpenIncidentsCard.tsx
│           │   │   └── RecentActivityFeed.tsx
│           │   ├── ai/
│           │   │   └── AiAssistPanel.tsx
│           │   └── forms/
│           │       ├── IncidentForm.tsx
│           │       ├── ChangeRequestForm.tsx
│           │       ├── SecurityFindingForm.tsx
│           │       └── DocumentUploadForm.tsx
│           ├── hooks/
│           │   ├── useAuth.ts
│           │   ├── useIncidents.ts
│           │   ├── useBackupRuns.ts
│           │   ├── useEtlRuns.ts
│           │   └── useChangeRequests.ts
│           ├── services/
│           │   └── api.ts
│           ├── store/
│           │   └── auth.store.ts
│           └── utils/
│               ├── formatDate.ts
│               ├── statusColor.ts
│               └── cn.ts
│
├── packages/
│   ├── types/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── incident.ts
│   │       ├── backup.ts
│   │       ├── etl.ts
│   │       ├── maintenance.ts
│   │       ├── reporting.ts
│   │       ├── submission.ts
│   │       ├── security.ts
│   │       ├── popia.ts
│   │       ├── changeRequest.ts
│   │       ├── document.ts
│   │       ├── monthlyReport.ts
│   │       ├── handover.ts
│   │       ├── audit.ts
│   │       └── user.ts
│   ├── core/
│   │   └── src/
│   │       ├── rbac.ts
│   │       ├── validators/
│   │       │   ├── incident.schema.ts
│   │       │   ├── changeRequest.schema.ts
│   │       │   ├── backupRun.schema.ts
│   │       │   └── etlRun.schema.ts
│   │       └── domain/
│   │           ├── incident.ts
│   │           └── changeRequest.ts
│   ├── supabase/
│   │   └── src/
│   │       ├── client.ts
│   │       ├── adminClient.ts
│   │       └── queries/
│   │           ├── incidents.ts
│   │           ├── backupRuns.ts
│   │           ├── etlRuns.ts
│   │           ├── changeRequests.ts
│   │           ├── security.ts
│   │           ├── documents.ts
│   │           └── audit.ts
│   └── ai/
│       └── src/
│           ├── client.ts
│           ├── prompts/
│           │   ├── incidentSummary.ts
│           │   ├── rcaDraft.ts
│           │   ├── changeRiskAssessment.ts
│           │   ├── monthlyReportDraft.ts
│           │   └── documentationAssist.ts
│           └── services/
│               ├── summarise.ts
│               └── draftReport.ts
│
├── supabase/
│   └── migrations/
│       ├── 001_profiles.sql
│       ├── 002_incidents.sql
│       ├── 003_backup_runs.sql
│       ├── 004_etl_runs.sql
│       ├── 005_maintenance_activities.sql
│       ├── 006_report_requests.sql
│       ├── 007_submission_readiness.sql
│       ├── 008_security_findings.sql
│       ├── 009_access_reviews.sql
│       ├── 010_popia_events.sql
│       ├── 011_change_requests.sql
│       ├── 012_documents.sql
│       ├── 013_monthly_reports.sql
│       ├── 014_handover_items.sql
│       ├── 015_audit_logs.sql
│       └── 016_ai_generations.sql
│
├── scripts/
│   └── build.sh
├── vercel.json
├── package.json
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── heqcis_tender_scope_context.md      # Copilot implementation context
├── HEQCIS_PORTAL_BUILD.md             # Detailed tender-aligned build spec
└── BLUEPRINT.md                        # ← this file
```

---

## 5. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              VERCEL  (lhr1)                                  │
│                                                                              │
│   ┌─────────────────────┐         ┌──────────────────────────────────────┐  │
│   │  apps/web           │         │  api/index.ts  (Vercel Function)     │  │
│   │  React 18 + Vite    │◄───────►│  Express-style router                │  │
│   │  Bootstrap 5        │  HTTPS  │  ├─ middleware/ (auth, rbac, audit)  │  │
│   │  TypeScript strict  │         │  ├─ routes/    (14 route modules)    │  │
│   └─────────────────────┘         │  └─ webhooks/  (3 HMAC handlers)    │  │
│                                   └──────────────┬───────────────────────┘  │
└──────────────────────────────────────────────────┼───────────────────────────┘
                                                   │
             ┌─────────────────────────────────────┼─────────────────────────┐
             │                                     │                         │
             ▼                                     ▼                         ▼
   ┌────────────────────┐             ┌────────────────────┐    ┌────────────────────┐
   │  Supabase Pro      │             │  OpenAI API        │    │  Azure (optional)  │
   │  - Postgres 15     │             │  - GPT-4o          │    │  - SQL Agent jobs  │
   │  - Auth JWT/SSO    │             │  - Summaries       │    │  - Backup polling  │
   │  - Storage         │             │  - RCA drafts      │    │  - ETL polling     │
   │  - RLS policies    │             │  - Report drafting │    │  - Webhook push →  │
   │  16 tables         │             │  Advisory only     │    │    /webhooks/*     │
   └────────────────────┘             └────────────────────┘    └────────────────────┘


                          ══════════ BOUNDARY ══════════
         ▲ Portal observes via webhooks only — NO direct connection from portal ▲


┌──────────────────────────────────────────────────────────────────────────────┐
│          EXISTING HEQCIS ENVIRONMENT  (external — unchanged by this portal)  │
│                                                                              │
│   ┌──────────────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│   │  ASP.NET MVC 4.7.2   │   │  SQL Server 2019 │   │  Pentaho ETL     │   │
│   │  IIS-hosted          │   │  Heqcis_web DB   │   │  HEQCISWEB_Job   │   │
│   │  (unchanged)         │   │  (read-only view │   │  (unchanged)     │   │
│   └──────────────────────┘   │   from portal)   │   └──────────────────┘   │
│                              └──────────────────┘                           │
│  ⚠ Portal NEVER writes to the HEQCIS production database directly           │
│  ⚠ Webhook payloads are HMAC-SHA256 verified before ingestion               │
│  ⚠ All operational metadata is stored in Supabase — not in Heqcis_web      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Data flow:**
1. CHE engineer authenticates via Supabase Auth (email/password or SSO — JWT issued)
2. React SPA calls `/api/*` with `Authorization: Bearer <jwt>` on every request
3. `authMiddleware` validates JWT server-side using the Supabase service role key
4. `rbacMiddleware` enforces role permissions per route (admin / engineer / analyst / viewer)
5. `auditMiddleware` writes an `audit_logs` row for every mutating request (POST/PUT/PATCH/DELETE)
6. Azure connectors (optional) push results via `POST /webhooks/sql-check-results`, `POST /webhooks/backup-results`, `POST /webhooks/etl-results` — all HMAC-verified
7. OpenAI is called only for advisory functions — AI output is **never** used to mutate production data without human review

---

## 6. Vercel Deployment Model

### `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "bash scripts/build.sh",
  "outputDirectory": "apps/web/dist",
  "installCommand": "echo 'Dependencies installed in build.sh'",
  "framework": null,
  "regions": ["lhr1"],
  "functions": {
    "api/index.ts": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index.ts" },
    { "source": "/webhooks/:path*", "destination": "/api/index.ts" },
    { "source": "/health", "destination": "/api/index.ts" },
    { "source": "/readiness", "destination": "/api/index.ts" },
    {
      "source": "/((?!api|webhooks|health|readiness|assets|_next|favicon.ico).*)",
      "destination": "/index.html"
    }
  ]
}
```

### `scripts/build.sh`

```bash
#!/bin/bash
set -e

echo "==> Installing root dependencies"
npm install

echo "==> Building packages"
npm run build --workspace=packages/types
npm run build --workspace=packages/core
npm run build --workspace=packages/supabase
npm run build --workspace=packages/ai

echo "==> Building frontend"
npm run build --workspace=apps/web

echo "==> Build complete"
```

### `api/index.ts` — production router

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Middleware
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';

// Route modules (14 tender-aligned)
import dashboardRoutes from './routes/dashboard';
import meRoutes from './routes/me';
import incidentRoutes from './routes/incidents';
import backupRunRoutes from './routes/backupRuns';
import etlRunRoutes from './routes/etlRuns';
import maintenanceRoutes from './routes/maintenanceActivities';
import reportRequestRoutes from './routes/reportRequests';
import submissionRoutes from './routes/submissionReadiness';
import securityRoutes from './routes/securityFindings';
import popiaRoutes from './routes/popiaEvents';
import changeRequestRoutes from './routes/changeRequests';
import documentRoutes from './routes/documents';
import monthlyReportRoutes from './routes/monthlyReports';
import handoverRoutes from './routes/handoverItems';
import auditRoutes from './routes/auditLogs';
import aiRoutes from './routes/ai';

// Webhook handlers (HMAC-verified, no auth middleware)
import sqlCheckWebhook from './webhooks/sqlCheckResults';
import backupWebhook from './webhooks/backupResults';
import etlWebhook from './webhooks/etlResults';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

// Health / readiness (no auth required)
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('/readiness', (_, res) => res.json({ status: 'ready' }));

// Webhooks — HMAC-verified before any body parsing
app.post('/webhooks/sql-check-results', sqlCheckWebhook);
app.post('/webhooks/backup-results', backupWebhook);
app.post('/webhooks/etl-results', etlWebhook);

// All /api/* routes require valid Supabase JWT + audit logging
app.use('/api', authMiddleware, auditMiddleware);

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/me', meRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/backup-runs', backupRunRoutes);
app.use('/api/etl-runs', etlRunRoutes);
app.use('/api/maintenance-activities', maintenanceRoutes);
app.use('/api/report-requests', reportRequestRoutes);
app.use('/api/submission-readiness', submissionRoutes);
app.use('/api/security-findings', securityRoutes);
app.use('/api/popia-events', popiaRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/monthly-reports', monthlyReportRoutes);
app.use('/api/handover-items', handoverRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/ai', aiRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default (req: VercelRequest, res: VercelResponse) => app(req as any, res as any);
```

---

## 7. Supabase Schema Design

> All 16 tables live in the `public` schema. Each table has RLS enabled. The Supabase project URL is `https://nkeklgfbssxujnuzcyqu.supabase.co`. Migrations live in `supabase/migrations/` (001–016).

### Tables

#### `profiles` (001)
```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  role         text not null default 'viewer'
                 check (role in ('admin','engineer','analyst','viewer')),
  department   text,
  phone        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
alter table profiles enable row level security;
create policy "Users read own profile"   on profiles for select using (auth.uid() = id);
create policy "Users update own profile" on profiles for update using (auth.uid() = id);
create policy "Admins read all profiles" on profiles for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
```

#### `incidents` (002)
```sql
create table incidents (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,          -- e.g. INC-2024-0001
  title            text not null,
  description      text,
  category         text,                          -- 'heqcis_app'|'database'|'etl'|'backup'|'network'|'security'|'other'
  affected_system  text,                          -- 'HEQCIS_WEB'|'HEQCIS_DB'|'PENTAHO'|'OTHER'
  severity         text not null,                 -- 'P1'|'P2'|'P3'|'P4'
  status           text not null default 'open',  -- 'open'|'in_progress'|'resolved'|'closed'
  assigned_to      uuid references profiles(id),
  reported_by      uuid references profiles(id),
  sla_breach_at    timestamptz,
  ai_summary       text,
  ai_rca_draft     text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  resolved_at      timestamptz
);
alter table incidents enable row level security;
```

#### `incident_updates` (002)
```sql
create table incident_updates (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid references incidents(id) on delete cascade,
  author_id   uuid references profiles(id),
  content     text not null,
  created_at  timestamptz default now()
);
alter table incident_updates enable row level security;
```

#### `backup_runs` (003)
```sql
create table backup_runs (
  id                      uuid primary key default gen_random_uuid(),
  source                  text not null default 'manual', -- 'webhook'|'manual'
  database_name           text not null,
  backup_type             text not null,  -- 'full'|'differential'|'log'
  status                  text not null,  -- 'success'|'failed'|'running'|'skipped'
  started_at              timestamptz,
  finished_at             timestamptz,
  size_bytes              bigint,
  disk_free_bytes_before  bigint,
  disk_free_bytes_after   bigint,
  backup_path             text,
  error_message           text,
  remediation_note        text,
  created_at              timestamptz default now()
);
alter table backup_runs enable row level security;
```

#### `etl_runs` (004)
```sql
create table etl_runs (
  id                    uuid primary key default gen_random_uuid(),
  source                text not null default 'manual', -- 'webhook'|'manual'
  job_name              text not null,
  pipeline_name         text,
  status                text not null,  -- 'success'|'failed'|'partial'|'running'
  rows_processed        integer,
  rows_failed           integer,
  started_at            timestamptz,
  finished_at           timestamptz,
  error_message         text,
  restart_required      boolean default false,
  restart_completed_at  timestamptz,
  created_at            timestamptz default now()
);
alter table etl_runs enable row level security;
```

#### `maintenance_activities` (005)
```sql
create table maintenance_activities (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  activity_type text not null,  -- 'scheduled'|'emergency'|'patch'|'upgrade'|'audit'
  status        text not null default 'planned',
  system_target text,
  scheduled_at  timestamptz,
  completed_at  timestamptz,
  performed_by  uuid references profiles(id),
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table maintenance_activities enable row level security;
```

#### `report_requests` (006)
```sql
create table report_requests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  requester_id  uuid references profiles(id),
  assigned_to   uuid references profiles(id),
  priority      text not null default 'normal',
  status        text not null default 'submitted',
  due_date      date,
  delivery_url  text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table report_requests enable row level security;
```

#### `submission_readiness_checks` (007)
```sql
create table submission_readiness_checks (
  id              uuid primary key default gen_random_uuid(),
  submission_type text not null,  -- 'SAQA_NLRD'|'DHET_STATS'|'HEQF_MAPPING'|'OTHER'
  period          text not null,
  overall_status  text not null default 'pending',
  checked_by      uuid references profiles(id),
  notes           text,
  checked_at      timestamptz default now(),
  created_at      timestamptz default now()
);
create table submission_validation_issues (
  id          uuid primary key default gen_random_uuid(),
  check_id    uuid references submission_readiness_checks(id) on delete cascade,
  field_name  text not null,
  issue_type  text not null,
  description text,
  resolved    boolean default false,
  created_at  timestamptz default now()
);
alter table submission_readiness_checks enable row level security;
alter table submission_validation_issues enable row level security;
```

#### `security_findings` (008)
```sql
create table security_findings (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text,
  severity                text not null,
  status                  text not null default 'open',
  source                  text,
  affected_system         text,
  assigned_to             uuid references profiles(id),
  ai_remediation_guidance text,
  due_date                date,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
alter table security_findings enable row level security;
```

#### `access_reviews` (009)
```sql
create table access_reviews (
  id            uuid primary key default gen_random_uuid(),
  period        text not null,
  system_name   text not null,
  reviewed_by   uuid references profiles(id),
  status        text not null default 'pending',
  findings      text,
  completed_at  timestamptz,
  created_at    timestamptz default now()
);
alter table access_reviews enable row level security;
-- Admin-only: enforce via RLS
create policy "Admin access_reviews" on access_reviews for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
```

#### `popia_events` (010)
```sql
create table popia_events (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null,  -- 'breach'|'request'|'consent'|'deletion'|'audit'
  description      text,
  data_subject     text,
  reported_by      uuid references profiles(id),
  status           text not null default 'open',
  resolution_notes text,
  resolved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table popia_events enable row level security;
```

#### `change_requests` (011)
```sql
create table change_requests (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique not null,  -- e.g. CHG-2024-0001
  title               text not null,
  description         text,
  type                text not null,   -- 'standard'|'emergency'|'normal'
  risk_level          text,            -- 'low'|'medium'|'high'|'critical'
  status              text not null default 'draft',
    -- 'draft'|'submitted'|'under_review'|'approved'|'rejected'|'implemented'|'closed'
  requested_by        uuid references profiles(id),
  scheduled_date      timestamptz,
  implemented_at      timestamptz,
  rollback_plan       text,
  testing_notes       text,
  ai_risk_assessment  text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create table change_request_approvals (
  id                 uuid primary key default gen_random_uuid(),
  change_request_id  uuid references change_requests(id) on delete cascade,
  approver_id        uuid references profiles(id),
  decision           text not null,  -- 'approved'|'rejected'|'abstained'
  comments           text,
  decided_at         timestamptz default now()
);
alter table change_requests enable row level security;
alter table change_request_approvals enable row level security;
```

#### `documents` (012)
```sql
create table documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text unique not null,
  doc_type        text not null,  -- 'runbook'|'procedure'|'policy'|'architecture'|'handover'
  content         text,           -- Markdown body
  storage_path    text,           -- Supabase Storage path for uploaded files
  category        text,
  tags            text[],
  version         text default '1.0',
  author_id       uuid references profiles(id),
  last_updated_by uuid references profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table documents enable row level security;
```

#### `monthly_reports` (013)
```sql
create table monthly_reports (
  id                          uuid primary key default gen_random_uuid(),
  period                      text not null unique,  -- e.g. '2024-07'
  status                      text not null default 'draft',
  -- 7 structured sections (AI-assisted drafting)
  section_executive_summary   text,
  section_incidents           text,
  section_backup_etl          text,
  section_change_requests     text,
  section_security_popia      text,
  section_submission_readiness text,
  section_upcoming_work       text,
  -- Metadata
  prepared_by                 uuid references profiles(id),
  approved_by                 uuid references profiles(id),
  approved_at                 timestamptz,
  published_at                timestamptz,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);
alter table monthly_reports enable row level security;
```

#### `handover_items` (014)
```sql
create table handover_items (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
    -- 'knowledge'|'access'|'documentation'|'process'|'system'
  title           text not null,
  description     text,
  status          text not null default 'pending',
  owner_id        uuid references profiles(id),
  target_date     date,
  completed_at    timestamptz,
  evidence_url    text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table handover_items enable row level security;
```

#### `audit_logs` (015)
```sql
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles(id),
  action        text not null,         -- 'create'|'update'|'delete'|'approve'|'view'
  resource_type text not null,
  resource_id   uuid,
  metadata      jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz default now()
);
alter table audit_logs enable row level security;
-- Append-only: no UPDATE or DELETE via RLS
create policy "Admins read audit_logs" on audit_logs for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "System inserts audit_logs" on audit_logs for insert with check (true);
```

#### `ai_generations` (016)
```sql
create table ai_generations (
  id             uuid primary key default gen_random_uuid(),
  resource_type  text not null,
  resource_id    uuid,
  prompt_type    text not null,
  prompt_tokens  integer,
  completion_tokens integer,
  model          text default 'gpt-4o',
  output         text not null,
  accepted       boolean,
  created_by     uuid references profiles(id),
  created_at     timestamptz default now()
);
alter table ai_generations enable row level security;
```

---

## 8. API Design

All routes are relative to `/api/`. All responses follow:

```typescript
{ data: T | null, error: string | null, meta?: { total: number, page: number } }
```

### Core / Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Liveness probe |
| `GET` | `/readiness` | None | Readiness probe |
| `GET` | `/api/me` | Any | Current user profile + role |

### Incident Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/incidents` | List incidents (paginated, filterable by status/severity/category) |
| `POST` | `/api/incidents` | Create incident (auto-generates `reference`) |
| `GET` | `/api/incidents/:id` | Get incident detail |
| `PATCH` | `/api/incidents/:id` | Update incident |
| `POST` | `/api/incidents/:id/updates` | Add an incident update/comment |
| `POST` | `/api/incidents/:id/summarise` | Trigger AI summary (GPT-4o, advisory) |
| `POST` | `/api/incidents/:id/rca` | Trigger AI RCA draft (advisory) |

### Backup Run Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/backup-runs` | List backup runs (filterable by database, status, date) |
| `GET` | `/api/backup-runs/summary` | Dashboard KPI summary |
| `POST` | `/api/backup-runs` | Manually ingest a backup run record |

### ETL Run Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/etl-runs` | List ETL runs (filterable by job, status, date) |
| `GET` | `/api/etl-runs/summary` | Dashboard KPI summary |
| `POST` | `/api/etl-runs` | Manually ingest an ETL run record |

### Maintenance Activity Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/maintenance-activities` | List maintenance activities |
| `POST` | `/api/maintenance-activities` | Create activity |
| `PATCH` | `/api/maintenance-activities/:id` | Update activity |

### Report Request Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/report-requests` | List reporting requests |
| `POST` | `/api/report-requests` | Create request |
| `PATCH` | `/api/report-requests/:id` | Update request |

### Submission Readiness Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/submission-readiness` | List readiness checks |
| `POST` | `/api/submission-readiness` | Create check |
| `GET` | `/api/submission-readiness/:id` | Get check + validation issues |
| `POST` | `/api/submission-readiness/:id/issues` | Add validation issue |

### Security & Compliance Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/security-findings` | List findings |
| `POST` | `/api/security-findings` | Create finding |
| `GET` | `/api/security-findings/:id` | Get finding detail |
| `PATCH` | `/api/security-findings/:id` | Update finding |
| `POST` | `/api/security-findings/:id/remediate` | Trigger AI remediation guidance |

### POPIA Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/popia-events` | List POPIA events |
| `POST` | `/api/popia-events` | Log event |
| `PATCH` | `/api/popia-events/:id` | Update event |

### Change Request Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/change-requests` | List CRs |
| `POST` | `/api/change-requests` | Create CR (auto-generates `reference`) |
| `GET` | `/api/change-requests/:id` | Get CR detail + approvals |
| `PATCH` | `/api/change-requests/:id` | Update CR |
| `POST` | `/api/change-requests/:id/approve` | Record approval decision |
| `POST` | `/api/change-requests/:id/assess` | Trigger AI risk assessment |

### Document Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/documents` | List documents (filterable by type/tag) |
| `POST` | `/api/documents` | Create document (inline or upload) |
| `GET` | `/api/documents/:slug` | Get document by slug |
| `PATCH` | `/api/documents/:slug` | Update document |
| `DELETE` | `/api/documents/:slug` | Archive document |

### Monthly Report Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/monthly-reports` | List monthly reports |
| `POST` | `/api/monthly-reports` | Create report shell for a period |
| `GET` | `/api/monthly-reports/:period` | Get report (e.g. `2024-07`) |
| `PATCH` | `/api/monthly-reports/:period` | Update sections |
| `POST` | `/api/monthly-reports/:period/generate-draft` | AI-assisted draft of all 7 sections |

### Handover Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/handover-items` | List handover items |
| `POST` | `/api/handover-items` | Create item |
| `PATCH` | `/api/handover-items/:id` | Update item |

### Audit Log Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/audit-logs` | admin | List audit log (paginated, immutable) |

### AI Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/summarise` | Generic summarisation |
| `POST` | `/api/ai/draft-report` | Trigger 7-section monthly report draft |
| `POST` | `/api/ai/documentation-assist` | Documentation drafting assist |

### Webhook Endpoints (HMAC-verified, no user auth)

| Method | Path | Source | Description |
|---|---|---|---|
| `POST` | `/webhooks/sql-check-results` | Azure SQL Agent | SQL health check results |
| `POST` | `/webhooks/backup-results` | SQL Agent / Azure | Backup job completion results |
| `POST` | `/webhooks/etl-results` | Pentaho / Azure | ETL job completion results |

---

## 9. Frontend Modules

### Pages

| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard.tsx` | KPI cards (incidents, backup, ETL, CRs), recent activity, system health |
| `/incidents` | `Incidents.tsx` | Incident list with filters (severity, category, status) |
| `/incidents/:id` | `IncidentDetail.tsx` | Detail + updates feed + AI summary/RCA panel |
| `/backup-health` | `BackupHealth.tsx` | Backup run table + success-rate KPI + trend chart |
| `/etl-health` | `EtlHealth.tsx` | ETL run table + health KPI + restart tracking |
| `/maintenance` | `MaintenanceLog.tsx` | Maintenance activity log (scheduled & emergency) |
| `/report-requests` | `ReportRequests.tsx` | Reporting request queue with status workflow |
| `/submission-readiness` | `SubmissionReadiness.tsx` | SAQA/NLRD/DHET readiness checks + issue tracker |
| `/security` | `SecurityCompliance.tsx` | Security findings list + severity chart |
| `/popia` | `PopiaRegister.tsx` | POPIA event register (breach, request, consent, deletion) |
| `/change-requests` | `ChangeRequests.tsx` | CR list + status workflow |
| `/change-requests/:id` | `ChangeRequestDetail.tsx` | CR detail + approval history + AI risk panel |
| `/documents` | `Documents.tsx` | Searchable document & runbook library |
| `/monthly-report/:period` | `MonthlyReport.tsx` | 7-section structured report editor + AI draft button |
| `/handover` | `HandoverReadiness.tsx` | 24-month contract handover progress tracker |
| `/audit` | `AuditLog.tsx` | Admin-only immutable audit log viewer |
| `/settings` | `Settings.tsx` | User profile, preferences, theme |

### Dashboard KPI Cards

- Open incidents by severity (P1 / P2 / P3 / P4)
- Backup success rate (last 24h / 7 days)
- ETL pipeline health (pass/fail ratio, restarts required)
- Open change requests by status
- Open security findings by severity
- Pending SAQA/DHET submission readiness checks
- Handover completion percentage (Phase 4)

### Key Shared Components

| Component | Purpose |
|---|---|
| `AppShell.tsx` | Root layout wrapper |
| `Sidebar.tsx` | Left nav with CHE-appropriate module labels + badge counts |
| `Topbar.tsx` | Header with user avatar, notifications, logout |
| `StatusBadge.tsx` | Colour-coded status pill |
| `SeverityBadge.tsx` | Colour-coded severity pill (P1=red…P4=blue) |
| `DataTable.tsx` | Sortable, filterable, paginated table |
| `KpiCard.tsx` | Dashboard metric tile |
| `AiAssistPanel.tsx` | Collapsible panel for AI-generated advisory content |
| `ConfirmModal.tsx` | Generic confirmation dialog |
| `MarkdownRenderer.tsx` | Safe markdown display for documents and runbooks |
| `SectionCard.tsx` | Titled content card with optional action button |
| `EmptyState.tsx` | Empty list placeholder with CTA |
| `LoadingSpinner.tsx` | Centred spinner |
| `ErrorAlert.tsx` | API error display |

---

## 10. AI Integration

All AI features use **OpenAI GPT-4o** via the `packages/ai` package.

### Services

#### `packages/ai/src/services/summarise.ts`
- Input: raw text (incident description + updates)
- Output: concise 2–3 paragraph operational summary
- Prompt: `packages/ai/src/prompts/incidentSummary.ts`

#### `packages/ai/src/services/analyse.ts`
- Input: structured data (change request description, risk factors)
- Output: risk assessment narrative + recommended controls
- Prompt: `packages/ai/src/prompts/rcaDraft.ts`, `changeRiskAssessment.ts`

### Prompt Design Principles

1. System prompt establishes the operational context (HEQCIS-style environment)
2. User prompt contains the structured data to analyse
3. Temperature: `0.3` (factual, conservative)
4. Max tokens: `1000` (summaries), `2000` (RCA drafts)
5. Streaming: optional for long RCA drafts
6. All AI outputs are stored back to Supabase on the relevant record (`ai_summary`, `ai_rca_draft`, etc.)

### Example Prompt — Incident Summary

```typescript
export const incidentSummaryPrompt = (incident: Incident, updates: IncidentUpdate[]) => ({
  system: `You are an experienced IT operations engineer working in a regulated higher education data environment.
Summarise the following incident in clear, factual language suitable for an operations report.
Be concise. Do not speculate. Focus on impact, timeline, and current status.`,
  user: `
Incident: ${incident.title}
Severity: ${incident.severity}
Status: ${incident.status}
Description: ${incident.description}

Updates:
${updates.map(u => `- ${u.created_at}: ${u.content}`).join('\n')}
`
});
```

---

## 11. Auth & RBAC

### Auth Flow

1. User logs in via Supabase Auth (email/password or SSO-ready)
2. Supabase returns a signed JWT
3. React stores JWT in memory (not `localStorage`) via Zustand auth store
4. Every API call sends `Authorization: Bearer <jwt>`
5. `api/middleware/auth.ts` verifies JWT using the Supabase admin client (service role key)
6. Request context carries `userId` and `role` for downstream RBAC enforcement

### Roles

| Role | Description |
|---|---|
| `admin` | Full access to all modules, audit log, user management, access reviews |
| `engineer` | Create/update incidents, CRs, backup runs, ETL runs, maintenance, security findings, documents |
| `analyst` | Read all operational data; create report requests, monthly reports, submission readiness checks |
| `viewer` | Read-only access to all non-sensitive modules |

### RBAC Helper — `packages/core/src/rbac.ts`

```typescript
export type Role = 'admin' | 'engineer' | 'analyst' | 'viewer';

export const PERMISSIONS: Record<string, Record<string, Role[]>> = {
  incidents:              { create: ['admin', 'engineer'], update: ['admin', 'engineer'], delete: ['admin'] },
  backupRuns:             { create: ['admin', 'engineer'], update: ['admin', 'engineer'] },
  etlRuns:                { create: ['admin', 'engineer'], update: ['admin', 'engineer'] },
  maintenanceActivities:  { create: ['admin', 'engineer'], update: ['admin', 'engineer'] },
  reportRequests:         { create: ['admin', 'engineer', 'analyst'], update: ['admin', 'engineer'] },
  submissionReadiness:    { create: ['admin', 'engineer', 'analyst'], update: ['admin', 'engineer'] },
  securityFindings:       { create: ['admin', 'engineer'], update: ['admin', 'engineer'] },
  accessReviews:          { create: ['admin'], update: ['admin'], read: ['admin'] },
  popiaEvents:            { create: ['admin', 'engineer'], update: ['admin'] },
  changeRequests:         { create: ['admin', 'engineer'], approve: ['admin'], update: ['admin', 'engineer'] },
  documents:              { create: ['admin', 'engineer'], delete: ['admin'], update: ['admin', 'engineer'] },
  monthlyReports:         { create: ['admin', 'analyst'], update: ['admin', 'analyst'], approve: ['admin'] },
  handoverItems:          { create: ['admin', 'engineer'], update: ['admin', 'engineer'] },
  auditLogs:              { read: ['admin'] },
  aiGenerations:          { create: ['admin', 'engineer', 'analyst'] },
};

export function can(role: Role, resource: string, action: string): boolean {
  const allowed = PERMISSIONS[resource]?.[action] as Role[] | undefined;
  return allowed ? allowed.includes(role) : false;
}
```

### Supabase RLS Policies

Every table has RLS enabled. The pattern is: authenticated users can read most tables; only admins and engineers can mutate; `audit_logs` is append-only (insert from server, read by admin only).

---

## 12. Packages / Shared Libraries

### `packages/types`

Central source of truth for all domain types. No runtime code. Pure TypeScript interfaces.

```typescript
// packages/types/src/incident.ts
export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  assigned_to: string | null;
  reported_by: string | null;
  ai_summary: string | null;
  ai_rca_draft: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  author_id: string;
  content: string;
  created_at: string;
}
```

### `packages/supabase`

```typescript
// packages/supabase/src/client.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://nkeklgfbssxujnuzcyqu.supabase.co',
  process.env.SUPABASE_ANON_KEY!
);

// packages/supabase/src/adminClient.ts
export const supabaseAdmin = createClient(
  'https://nkeklgfbssxujnuzcyqu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
);
```

### `packages/ai`

```typescript
// packages/ai/src/client.ts
import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});
```

---

## 13. Environment Variables

### Vercel / Server-side (never expose to client)

```env
SUPABASE_URL=https://nkeklgfbssxujnuzcyqu.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
WEBHOOK_SECRET=<random 32-char hex — generate with: openssl rand -hex 32>
ALLOWED_ORIGIN=https://sbdmog.vercel.app
```

### Client-side (Vite — prefix `VITE_`)

```env
VITE_SUPABASE_URL=https://nkeklgfbssxujnuzcyqu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_BASE_URL=https://sbdmog.vercel.app
```

> ⚠️ **Never** expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to the frontend.

---

## 14. Build & Scripts

### Root `package.json`

```json
{
  "name": "sbdmog",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "build": "bash scripts/build.sh",
    "dev": "concurrently \"npm run dev --workspace=apps/web\"",
    "type-check": "tsc --noEmit -p tsconfig.base.json"
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

---

## 15. Feature Roadmap

> 24-month contract delivery phased to match the CHE HEQCIS tender scope. Each phase builds on the previous without disrupting live HEQCIS operations.

### Phase 0 — Immediate Stabilisation (Month 1–2)
- [ ] Monorepo scaffolding + Vercel + Supabase project initialisation
- [ ] Auth flow (login, JWT, route guards, role seeding)
- [ ] Dashboard shell (sidebar with CHE-appropriate labels, topbar, KPI cards)
- [ ] Incident management — create, update, status workflow, SLA breach tracking
- [ ] Backup run ingest endpoint + dashboard view (manual entry first)
- [ ] ETL run ingest endpoint + dashboard view (manual entry first)
- [ ] Basic document library (runbooks, procedures — Markdown)

### Phase 1 — Operations Baseline (Month 2–4)
- [ ] Webhook endpoints (sql-check-results, backup-results, etl-results) with HMAC verification
- [ ] Azure connector integration for automated backup and ETL result ingestion
- [ ] Maintenance activity log (scheduled + emergency)
- [ ] Change request workflow (draft → submitted → under review → approved/rejected → implemented)
- [ ] Change request approval history + approver sign-off

### Phase 2 — Governance & Compliance (Month 4–8)
- [ ] Security findings module (CRUD, severity, assignment, due-date tracking)
- [ ] Access review register (admin-only — quarterly access reviews)
- [ ] POPIA event register (breach, request, consent, deletion, audit)
- [ ] Submission readiness checks (SAQA/NLRD, DHET Stats, HEQF Mapping)
- [ ] Submission validation issue tracker
- [ ] Audit log viewer (admin — immutable, paginated)

### Phase 3 — Reporting & AI (Month 6–12)
- [ ] AI incident summary (GPT-4o, CHE-specific system prompt, advisory only)
- [ ] AI RCA draft (structured output with recommended preventive actions)
- [ ] AI change request risk assessment
- [ ] Monthly report module — 7-section structured editor
- [ ] AI-assisted monthly report draft (GPT-4o, all 7 sections in one call)
- [ ] Report request workflow
- [ ] Export / download for monthly reports

### Phase 4 — Handover & Knowledge Transfer (Month 18–24)
- [ ] Handover readiness tracker (knowledge, access, documentation, process, system categories)
- [ ] Documentation assist AI (GPT-4o drafts procedure documents)
- [ ] Full runbook / knowledge base audit and gap-fill
- [ ] System architecture documentation updated and versioned
- [ ] Handover completion dashboard with percentage progress

### Phase 5 — Azure Connectors (Optional / Future)
- [ ] Azure SQL monitoring connector (automated SQL health checks → webhook push)
- [ ] Azure Logic Apps / Functions for scheduled Pentaho ETL polling
- [ ] Entra ID / SSO integration via Supabase Auth SAML provider
- [ ] Expanded analytics dashboards (trend charts, SLA breach heatmaps)

---

## 16. Cost Model

| Service | Tier | Estimated Cost |
|---|---|---|
| Vercel | Hobby / Pro | $0–$20/month |
| Supabase | Free / Pro | $0–$25/month |
| OpenAI | Pay-per-use | ~$5–$30/month (usage-based) |
| Azure | Optional | $0 unless connectors activated |
| **Total** | | **~$5–$75/month** |

This is a **cost-optimised, serverless-first** architecture. The platform scales to zero when idle and scales automatically under load.

---

## 17. Coding Conventions

1. **TypeScript strict mode** everywhere. No `any` unless unavoidable and commented.
2. **Named exports** preferred over default exports (except page components and `api/index.ts`).
3. **Async/await** only. No raw Promise chains.
4. **Error handling**: all API route handlers use try/catch and return `{ data: null, error: message }` on failure.
5. **Audit logging**: any state-changing operation (create, update, delete, approve) must write to `audit_log`.
6. **No secrets in code**: all secrets via environment variables only.
7. **Zod** for runtime validation of all API request bodies.
8. **React Query** (`@tanstack/react-query`) for all data fetching in the frontend.
9. **Bootstrap 5** classes only for layout and components. Minimal custom CSS.
10. **Comments**: complex business logic and AI prompts must be commented with intent, not mechanics.

---

*This document is the single source of truth for the HEQCIS Service Operations and Enhancement Portal build. Update it as architectural decisions are made and phases are completed.*
