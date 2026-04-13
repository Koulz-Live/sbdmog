# HEQCIS Service Operations & Enhancement Portal
## Phase 2 Build Reference — Tender-Aligned Architecture

> **Supersedes:** Generic ops platform design in `BLUEPRINT.md`
> **Date:** April 11, 2026
> **Repo:** `Koulz-Live/sbdmog` · **Branch:** `main`
> **Context:** 24-month HEQCIS support, maintenance, enhancement, monitoring, governance, documentation, and controlled modernization tender

---

## Table of Contents

1. [Tender Context & Reframe](#1-tender-context--reframe)
2. [Existing HEQCIS Environment](#2-existing-heqcis-environment)
3. [Architecture Principle](#3-architecture-principle)
4. [Technology Stack](#4-technology-stack)
5. [Revised Project Structure](#5-revised-project-structure)
6. [Supabase Schema & Migrations](#6-supabase-schema--migrations)
7. [Shared Domain Types](#7-shared-domain-types)
8. [API Router — `api/index.ts`](#8-api-router--apiindexts)
9. [API Route Modules](#9-api-route-modules)
10. [Webhook Handlers](#10-webhook-handlers)
11. [Frontend Pages & Components](#11-frontend-pages--components)
12. [AI Integration](#12-ai-integration)
13. [Auth & RBAC](#13-auth--rbac)
14. [Environment Variables](#14-environment-variables)
15. [Build & Vercel Config](#15-build--vercel-config)
16. [Monthly Reporting Framework](#16-monthly-reporting-framework)
17. [Handover Readiness Module](#17-handover-readiness-module)
18. [Capability Phase Map](#18-capability-phase-map)
19. [Coding Conventions](#19-coding-conventions)

---

## 1. Tender Context & Reframe

This portal is a **HEQCIS Service Operations and Enhancement Portal** built to support CHE's internal team across a 24-month service contract.

It is **not** a replacement for HEQCIS. It is a **governance, monitoring, documentation, and controlled enhancement layer** around the live system.

### Tender-aligned capability areas

| Label | Tender Scope |
|---|---|
| **Phase 0 Stabilisation** | Backup recovery, ETL stability, storage threshold tracking |
| **Database Maintenance** | SQL Agent monitoring, integrity checks, performance logging |
| **Data & Reporting** | Extraction requests, SAQA/NLRD readiness, Edu.Dex issues |
| **Security & POPIA** | Access reviews, dormant accounts, breach logging, ROPA |
| **Change Governance** | Formal change control, UAT, deployment, PIR |
| **Documentation & Training** | Runbooks, ETL guides, training materials, handover artefacts |
| **Monthly Reporting** | 7-section structured operational report |
| **Handover Readiness** | End-of-contract IP transfer, artefact register, credential checklist |

---

## 2. Existing HEQCIS Environment

> The portal supports — it does NOT replace — this stack.

| Component | Detail |
|---|---|
| Web App | ASP.NET MVC / .NET Framework 4.7.2 + Entity Framework 6 |
| Database | SQL Server 2019 · database name: `Heqcis_web` |
| ETL | Pentaho Data Integration · job: `HEQCISWEB_Job` |
| Submissions | SAQA/NLRD submission workflows |
| Known Risks | Backup failures (disk space + `NOINIT`), ETL manual restart after reboot, direct end-user DB access, dormant SQL accounts, POPIA audit exposure |

---

## 3. Architecture Principle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HEQCIS SERVICE PORTAL (this build)               │
│                                                                     │
│  React + Vite (Vercel CDN)   ←→   api/index.ts (Vercel Function)  │
│                                          │                          │
│              ┌───────────────────────────┼──────────────────┐      │
│              │                           │                  │      │
│        Supabase Postgres           OpenAI GPT-4o       Azure (opt) │
│        (operational metadata,      (summaries, RCA,   (SQL check   │
│         auth, audit, storage)       report drafts)     connectors) │
│                                                                     │
│  ─────────────────────────── BOUNDARY ─────────────────────────── │
│                                                                     │
│         EXISTING HEQCIS ENVIRONMENT (external, unchanged)           │
│         SQL Server 2019 · ASP.NET MVC · Pentaho ETL                │
│         Webhooks / connectors push status INTO the portal           │
└─────────────────────────────────────────────────────────────────────┘
```

**Rules:**
- HEQCIS production DB is **read-only from the portal's perspective** during Phase 1
- Results from SQL health checks are **pushed in via webhooks**, never pulled live by the Vercel Function
- All AI output is **advisory only** — no AI output writes to HEQCIS
- All state changes in the portal write to `audit_logs`

---

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Bootstrap 5 (enterprise tone, no startup UI) |
| Frontend Hosting | Vercel (CDN, CI/CD) |
| API | Vercel Functions — single entrypoint `api/index.ts` |
| API Middleware | Express-compatible (cors, helmet, body-parser, JWT auth) |
| Database | Supabase Postgres (`https://nkeklgfbssxujnuzcyqu.supabase.co`) |
| Auth | Supabase Auth (JWT, email/password, SSO-ready) |
| Storage | Supabase Storage (documents, runbooks, artefacts) |
| AI | OpenAI GPT-4o (summaries, RCA, report drafts, doc assist) |
| Azure | Optional — SQL monitoring jobs, backup check connectors, ETL polling |
| Language | TypeScript strict everywhere |
| Data Fetching | `@tanstack/react-query` |
| Validation | Zod |
| State | Zustand |

---

## 5. Revised Project Structure

```
sbdmog/
│
├── api/
│   ├── index.ts                        # Single Vercel Function entrypoint
│   ├── middleware/
│   │   ├── auth.ts                     # JWT verification via Supabase
│   │   ├── rbac.ts                     # Role enforcement middleware
│   │   ├── audit.ts                    # Auto audit-log middleware
│   │   └── validate.ts                 # Zod request body validation
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
│       ├── sqlCheckResults.ts
│       ├── backupResults.ts
│       └── etlResults.ts
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
│           │   ├── BackupHealth.tsx
│           │   ├── EtlHealth.tsx
│           │   ├── MaintenanceLog.tsx
│           │   ├── ReportRequests.tsx
│           │   ├── SubmissionReadiness.tsx
│           │   ├── SecurityCompliance.tsx
│           │   ├── PopiaRegister.tsx
│           │   ├── ChangeRequests.tsx
│           │   ├── ChangeRequestDetail.tsx
│           │   ├── Documents.tsx
│           │   ├── MonthlyReport.tsx
│           │   ├── HandoverReadiness.tsx
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
│           │   └── api.ts              # Typed API client (fetch wrapper)
│           ├── store/
│           │   └── auth.store.ts       # Zustand auth store
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
├── BLUEPRINT.md                        # v1 generic platform reference
└── HEQCIS_PORTAL_BUILD.md             # ← this file (v2 tender-aligned)
```

---

## 6. Supabase Schema & Migrations

### `001_profiles.sql`
```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'viewer'
    check (role in ('admin', 'engineer', 'analyst', 'viewer')),
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_select_admin" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
```

### `002_incidents.sql`
```sql
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. INC-2026-001
  title text not null,
  description text,
  category text not null
    check (category in ('backup','etl','database','network','security','application','other')),
  severity text not null
    check (severity in ('P1','P2','P3','P4')),
  status text not null default 'open'
    check (status in ('open','in_progress','pending_vendor','resolved','closed')),
  affected_system text,                  -- e.g. 'Heqcis_web', 'HEQCISWEB_Job'
  assigned_to uuid references public.profiles(id),
  reported_by uuid references public.profiles(id),
  sla_breach_at timestamptz,
  resolved_at timestamptz,
  ai_summary text,
  ai_rca_draft text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.incidents enable row level security;

create table public.incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  content text not null,
  is_resolution_note boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.incident_updates enable row level security;

create policy "incidents_read_authenticated" on public.incidents
  for select using (auth.role() = 'authenticated');

create policy "incidents_insert_engineer" on public.incidents
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "incidents_update_engineer" on public.incidents
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `003_backup_runs.sql`
```sql
create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  database_name text not null default 'Heqcis_web',
  backup_type text not null
    check (backup_type in ('full','differential','log','filegroup')),
  status text not null
    check (status in ('success','failed','running','skipped','partial')),
  started_at timestamptz,
  finished_at timestamptz,
  size_bytes bigint,
  backup_file_path text,
  disk_free_bytes_before bigint,
  disk_free_bytes_after bigint,
  error_message text,
  remediation_note text,
  source text not null default 'webhook'
    check (source in ('webhook','manual','azure_connector')),
  created_at timestamptz not null default now()
);
alter table public.backup_runs enable row level security;

create policy "backup_runs_read" on public.backup_runs
  for select using (auth.role() = 'authenticated');

create policy "backup_runs_insert" on public.backup_runs
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `004_etl_runs.sql`
```sql
create table public.etl_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null default 'HEQCISWEB_Job',
  status text not null
    check (status in ('success','failed','running','partial','skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  rows_processed integer,
  rows_failed integer,
  error_message text,
  restart_required boolean not null default false,
  restart_completed_at timestamptz,
  source text not null default 'webhook'
    check (source in ('webhook','manual','azure_connector')),
  created_at timestamptz not null default now()
);
alter table public.etl_runs enable row level security;

create policy "etl_runs_read" on public.etl_runs
  for select using (auth.role() = 'authenticated');

create policy "etl_runs_insert" on public.etl_runs
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `005_maintenance_activities.sql`
```sql
create table public.maintenance_activities (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. MNT-2026-001
  activity_type text not null
    check (activity_type in ('index_rebuild','integrity_check','stats_update','patching',
                              'storage_cleanup','sql_agent_job','security_review','other')),
  title text not null,
  description text,
  affected_system text,
  performed_by uuid references public.profiles(id),
  performed_at timestamptz,
  outcome text
    check (outcome in ('success','failed','partial','pending')),
  findings text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.maintenance_activities enable row level security;

create policy "maintenance_read" on public.maintenance_activities
  for select using (auth.role() = 'authenticated');

create policy "maintenance_insert" on public.maintenance_activities
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `006_report_requests.sql`
```sql
create table public.report_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. RPT-2026-001
  title text not null,
  description text,
  requester_id uuid not null references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status text not null default 'submitted'
    check (status in ('submitted','in_progress','delivered','closed','cancelled')),
  report_type text
    check (report_type in ('saqa','nlrd','internal','ad_hoc','monthly','audit','other')),
  due_date date,
  delivery_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.report_requests enable row level security;

create policy "report_requests_read" on public.report_requests
  for select using (auth.role() = 'authenticated');

create policy "report_requests_insert" on public.report_requests
  for insert with check (auth.role() = 'authenticated');

create policy "report_requests_update" on public.report_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );
```

### `007_submission_readiness.sql`
```sql
create table public.submission_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  submission_cycle text not null,       -- e.g. '2026-Q1'
  submission_type text not null
    check (submission_type in ('saqa','nlrd','edu_dex')),
  checklist_item text not null,
  status text not null default 'pending'
    check (status in ('pending','in_progress','complete','blocked','not_applicable')),
  owner_id uuid references public.profiles(id),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.submission_readiness_checks enable row level security;

create table public.submission_validation_issues (
  id uuid primary key default gen_random_uuid(),
  readiness_check_id uuid references public.submission_readiness_checks(id) on delete cascade,
  submission_cycle text not null,
  issue_type text not null
    check (issue_type in ('qualification_mismatch','missing_field','edu_dex_error',
                           'nlrd_rejection','format_error','other')),
  description text not null,
  affected_records integer,
  status text not null default 'open'
    check (status in ('open','in_investigation','resolved','accepted_risk')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.submission_validation_issues enable row level security;

create policy "submission_readiness_read" on public.submission_readiness_checks
  for select using (auth.role() = 'authenticated');

create policy "submission_readiness_write" on public.submission_readiness_checks
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );
```

### `008_security_findings.sql`
```sql
create table public.security_findings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. SEC-2026-001
  title text not null,
  description text,
  severity text not null
    check (severity in ('critical','high','medium','low','info')),
  category text not null
    check (category in ('direct_db_access','dormant_account','privileged_access',
                         'failed_login','unpatched_component','configuration','other')),
  status text not null default 'open'
    check (status in ('open','in_remediation','remediated','accepted_risk','false_positive')),
  affected_system text,
  assigned_to uuid references public.profiles(id),
  due_date date,
  remediation_plan text,
  ai_remediation_guidance text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.security_findings enable row level security;

create policy "security_findings_read" on public.security_findings
  for select using (auth.role() = 'authenticated');

create policy "security_findings_write" on public.security_findings
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `009_access_reviews.sql`
```sql
create table public.access_reviews (
  id uuid primary key default gen_random_uuid(),
  review_cycle text not null,           -- e.g. '2026-Q1'
  account_name text not null,           -- SQL login or app account
  account_type text not null
    check (account_type in ('sql_login','windows_account','app_service','ad_group')),
  is_dormant boolean not null default false,
  last_login_at timestamptz,
  access_level text,
  action_required text
    check (action_required in ('disable','delete','review','retain','none')),
  action_status text not null default 'pending'
    check (action_status in ('pending','in_progress','completed','deferred')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.access_reviews enable row level security;

create policy "access_reviews_admin_only" on public.access_reviews
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

### `010_popia_events.sql`
```sql
create table public.popia_events (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. POPIA-2026-001
  event_type text not null
    check (event_type in ('breach','near_miss','data_subject_request','ropa_update',
                           'impact_assessment','training','policy_review','other')),
  title text not null,
  description text,
  severity text
    check (severity in ('high','medium','low')),
  status text not null default 'open'
    check (status in ('open','under_investigation','resolved','reported_to_irc','closed')),
  data_subjects_affected integer,
  reported_to_irc boolean not null default false,
  irc_reference text,
  assigned_to uuid references public.profiles(id),
  due_date date,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.popia_events enable row level security;

create policy "popia_events_read" on public.popia_events
  for select using (auth.role() = 'authenticated');

create policy "popia_events_write" on public.popia_events
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `011_change_requests.sql`
```sql
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,       -- e.g. CR-2026-001
  title text not null,
  description text,
  change_type text not null
    check (change_type in ('standard','normal','emergency','enhancement','patch')),
  risk_level text
    check (risk_level in ('low','medium','high','critical')),
  status text not null default 'draft'
    check (status in ('draft','submitted','impact_assessment','approved','rejected',
                       'in_uat','deployed','pir_pending','closed')),
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  scheduled_date timestamptz,
  deployed_at timestamptz,
  rollback_plan text,
  impact_assessment text,
  uat_notes text,
  pir_notes text,
  ai_risk_assessment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.change_requests enable row level security;

create table public.change_request_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.change_requests(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null
    check (decision in ('approved','rejected','deferred')),
  comments text,
  decided_at timestamptz not null default now()
);
alter table public.change_request_approvals enable row level security;

create policy "cr_read" on public.change_requests
  for select using (auth.role() = 'authenticated');

create policy "cr_insert" on public.change_requests
  for insert with check (auth.role() = 'authenticated');

create policy "cr_update" on public.change_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "cr_approvals_admin" on public.change_request_approvals
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

### `012_documents.sql`
```sql
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category text not null
    check (category in ('runbook','backup_procedure','etl_guide','reporting_procedure',
                         'popia_runbook','architecture','training','handover','other')),
  content text,                         -- Markdown body (inline docs)
  storage_path text,                    -- Supabase Storage path (uploaded files)
  version text not null default '1.0',
  status text not null default 'draft'
    check (status in ('draft','review','published','archived')),
  author_id uuid references public.profiles(id),
  last_updated_by uuid references public.profiles(id),
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;

create policy "documents_read" on public.documents
  for select using (auth.role() = 'authenticated');

create policy "documents_write" on public.documents
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );
```

### `013_monthly_reports.sql`
```sql
create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  report_period text unique not null,   -- e.g. '2026-03'
  status text not null default 'draft'
    check (status in ('draft','under_review','approved','submitted','archived')),
  -- 7 tender-aligned sections (stored as markdown)
  section_maintenance text,
  section_backup_dr text,
  section_data_reporting text,
  section_security_compliance text,
  section_enhancements_changes text,
  section_capacity_support text,
  section_risks_issues text,
  -- AI drafting
  ai_draft_generated_at timestamptz,
  ai_draft_version integer not null default 0,
  -- Approval
  prepared_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.monthly_reports enable row level security;

create policy "monthly_reports_read" on public.monthly_reports
  for select using (auth.role() = 'authenticated');

create policy "monthly_reports_write" on public.monthly_reports
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );
```

### `014_handover_items.sql`
```sql
create table public.handover_items (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('backup_verification','configuration_doc','manual','architecture_artefact',
                         'runbook','credential_transfer','knowledge_transfer_session',
                         'ip_transfer','outstanding_issue','other')),
  title text not null,
  description text,
  status text not null default 'pending'
    check (status in ('pending','in_progress','complete','not_applicable')),
  owner_id uuid references public.profiles(id),
  due_date date,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.handover_items enable row level security;

create policy "handover_read" on public.handover_items
  for select using (auth.role() = 'authenticated');

create policy "handover_write" on public.handover_items
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );
```

### `015_audit_logs.sql`
```sql
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_email text,
  action text not null,                 -- e.g. 'incident.create', 'cr.approve'
  resource_type text not null,
  resource_id uuid,
  resource_ref text,                    -- human-readable e.g. INC-2026-001
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;

-- Append-only: no UPDATE or DELETE
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

create policy "audit_logs_read_admin" on public.audit_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

### `016_ai_generations.sql`
```sql
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,          -- e.g. 'incident', 'monthly_report', 'change_request'
  resource_id uuid not null,
  generation_type text not null
    check (generation_type in ('summary','rca_draft','risk_assessment','report_draft',
                                'remediation_guidance','documentation_assist')),
  prompt_tokens integer,
  completion_tokens integer,
  model text not null default 'gpt-4o',
  output text not null,
  generated_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.ai_generations enable row level security;

create policy "ai_generations_read" on public.ai_generations
  for select using (auth.role() = 'authenticated');

create policy "ai_generations_insert" on public.ai_generations
  for insert with check (auth.role() = 'authenticated');
```

---

## 7. Shared Domain Types

### `packages/types/src/incident.ts`
```typescript
export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type IncidentStatus = 'open' | 'in_progress' | 'pending_vendor' | 'resolved' | 'closed';
export type IncidentCategory =
  | 'backup' | 'etl' | 'database' | 'network' | 'security' | 'application' | 'other';

export interface Incident {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affected_system: string | null;
  assigned_to: string | null;
  reported_by: string | null;
  sla_breach_at: string | null;
  resolved_at: string | null;
  ai_summary: string | null;
  ai_rca_draft: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  author_id: string;
  content: string;
  is_resolution_note: boolean;
  created_at: string;
}

export interface CreateIncidentDto {
  title: string;
  description?: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  affected_system?: string;
  assigned_to?: string;
}
```

### `packages/types/src/backup.ts`
```typescript
export type BackupType = 'full' | 'differential' | 'log' | 'filegroup';
export type BackupStatus = 'success' | 'failed' | 'running' | 'skipped' | 'partial';
export type BackupSource = 'webhook' | 'manual' | 'azure_connector';

export interface BackupRun {
  id: string;
  database_name: string;
  backup_type: BackupType;
  status: BackupStatus;
  started_at: string | null;
  finished_at: string | null;
  size_bytes: number | null;
  backup_file_path: string | null;
  disk_free_bytes_before: number | null;
  disk_free_bytes_after: number | null;
  error_message: string | null;
  remediation_note: string | null;
  source: BackupSource;
  created_at: string;
}

export interface CreateBackupRunDto {
  database_name?: string;
  backup_type: BackupType;
  status: BackupStatus;
  started_at?: string;
  finished_at?: string;
  size_bytes?: number;
  backup_file_path?: string;
  disk_free_bytes_before?: number;
  disk_free_bytes_after?: number;
  error_message?: string;
  source?: BackupSource;
}

export interface BackupSummary {
  success_rate_24h: number;
  success_rate_7d: number;
  last_successful_at: string | null;
  last_failed_at: string | null;
  disk_warning: boolean;
}
```

### `packages/types/src/etl.ts`
```typescript
export type EtlStatus = 'success' | 'failed' | 'running' | 'partial' | 'skipped';
export type EtlSource = 'webhook' | 'manual' | 'azure_connector';

export interface EtlRun {
  id: string;
  job_name: string;
  status: EtlStatus;
  started_at: string | null;
  finished_at: string | null;
  rows_processed: number | null;
  rows_failed: number | null;
  error_message: string | null;
  restart_required: boolean;
  restart_completed_at: string | null;
  source: EtlSource;
  created_at: string;
}

export interface EtlSummary {
  success_rate_24h: number;
  last_run_status: EtlStatus | null;
  last_run_at: string | null;
  restart_risk: boolean;
}
```

### `packages/types/src/changeRequest.ts`
```typescript
export type ChangeType = 'standard' | 'normal' | 'emergency' | 'enhancement' | 'patch';
export type ChangeRisk = 'low' | 'medium' | 'high' | 'critical';
export type ChangeStatus =
  | 'draft' | 'submitted' | 'impact_assessment' | 'approved' | 'rejected'
  | 'in_uat' | 'deployed' | 'pir_pending' | 'closed';

export interface ChangeRequest {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  change_type: ChangeType;
  risk_level: ChangeRisk | null;
  status: ChangeStatus;
  requested_by: string;
  approved_by: string | null;
  scheduled_date: string | null;
  deployed_at: string | null;
  rollback_plan: string | null;
  impact_assessment: string | null;
  uat_notes: string | null;
  pir_notes: string | null;
  ai_risk_assessment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeRequestApproval {
  id: string;
  change_request_id: string;
  reviewer_id: string;
  decision: 'approved' | 'rejected' | 'deferred';
  comments: string | null;
  decided_at: string;
}
```

### `packages/types/src/user.ts`
```typescript
export type UserRole = 'admin' | 'engineer' | 'analyst' | 'viewer';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  department: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## 8. API Router — `api/index.ts`

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Middleware
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';

// Routes
import dashboardRouter from './routes/dashboard';
import incidentsRouter from './routes/incidents';
import backupRunsRouter from './routes/backupRuns';
import etlRunsRouter from './routes/etlRuns';
import maintenanceRouter from './routes/maintenanceActivities';
import reportRequestsRouter from './routes/reportRequests';
import submissionReadinessRouter from './routes/submissionReadiness';
import securityFindingsRouter from './routes/securityFindings';
import popiaEventsRouter from './routes/popiaEvents';
import changeRequestsRouter from './routes/changeRequests';
import documentsRouter from './routes/documents';
import monthlyReportsRouter from './routes/monthlyReports';
import handoverItemsRouter from './routes/handoverItems';
import auditLogsRouter from './routes/auditLogs';
import aiRouter from './routes/ai';

// Webhooks (no auth middleware — use webhook secret instead)
import sqlCheckWebhook from './webhooks/sqlCheckResults';
import backupWebhook from './webhooks/backupResults';
import etlWebhook from './webhooks/etlResults';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));

// Health probes (no auth)
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', service: 'heqcis-portal' }));
app.get('/readiness', (_req: Request, res: Response) => res.json({ status: 'ready' }));

// Webhook routes (HMAC-verified, no JWT auth)
app.use('/webhooks/sql-check-results', sqlCheckWebhook);
app.use('/webhooks/backup-results', backupWebhook);
app.use('/webhooks/etl-results', etlWebhook);

// JWT auth on all /api/* routes
app.use('/api', authMiddleware);
app.use('/api', auditMiddleware);

// API routes
app.use('/api/dashboard', dashboardRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/backup-runs', backupRunsRouter);
app.use('/api/etl-runs', etlRunsRouter);
app.use('/api/maintenance-activities', maintenanceRouter);
app.use('/api/report-requests', reportRequestsRouter);
app.use('/api/submission-readiness', submissionReadinessRouter);
app.use('/api/security-findings', securityFindingsRouter);
app.use('/api/popia-events', popiaEventsRouter);
app.use('/api/change-requests', changeRequestsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/monthly-reports', monthlyReportsRouter);
app.use('/api/handover-items', handoverItemsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/ai', aiRouter);

// 404 fallback
app.use((_req: Request, res: Response) => {
  res.status(404).json({ data: null, error: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ data: null, error: 'Internal server error' });
});

// Vercel Function export
export default (req: VercelRequest, res: VercelResponse) =>
  app(req as unknown as Request, res as unknown as Response);
```

---

## 9. API Route Modules

### `api/middleware/auth.ts`
```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  'https://nkeklgfbssxujnuzcyqu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ data: null, error: 'Unauthorized' });
    return;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ data: null, error: 'Invalid or expired token' });
    return;
  }
  // Fetch role from profiles
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  req.userId = data.user.id;
  req.userEmail = data.user.email;
  req.userRole = profile?.role ?? 'viewer';
  next();
}
```

### `api/middleware/audit.ts`
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  'https://nkeklgfbssxujnuzcyqu.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

export async function auditMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (MUTATING_METHODS.includes(req.method)) {
    // Fire-and-forget audit log entry; never block the request
    supabaseAdmin.from('audit_logs').insert({
      actor_id: req.userId,
      actor_email: req.userEmail,
      action: `${req.method.toLowerCase()}.${req.path.replace(/\//g, '.')}`,
      resource_type: req.path.split('/')[1] ?? 'unknown',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      metadata: { body: req.body },
    }).then(() => undefined).catch(console.error);
  }
  next();
}
```

### `api/routes/incidents.ts`
```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { generateIncidentSummary, generateRcaDraft } from '../lib/ai';

const router = Router();

const createSchema = z.object({
  title: z.string().min(5),
  description: z.string().optional(),
  category: z.enum(['backup','etl','database','network','security','application','other']),
  severity: z.enum(['P1','P2','P3','P4']),
  affected_system: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});

// GET /api/incidents
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, severity, category, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('incidents')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (category) query = query.eq('category', category);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, error: null, meta: { total: count ?? 0, page: Number(page) } });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// GET /api/incidents/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_updates(*)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/incidents
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createSchema.parse(req.body);
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from('incidents').select('*', { count: 'exact', head: true });
    const ref = `INC-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('incidents')
      .insert({ ...body, reference: ref, reported_by: req.userId })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ data, error: null });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

// PATCH /api/incidents/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/incidents/:id/updates
router.post('/:id/updates', async (req: AuthRequest, res: Response) => {
  try {
    const { content, is_resolution_note = false } = req.body;
    const { data, error } = await supabaseAdmin
      .from('incident_updates')
      .insert({ incident_id: req.params.id, author_id: req.userId, content, is_resolution_note })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/incidents/:id/summarise
router.post('/:id/summarise', async (req: AuthRequest, res: Response) => {
  try {
    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_updates(*)')
      .eq('id', req.params.id)
      .single();

    const summary = await generateIncidentSummary(incident, incident.incident_updates);

    await supabaseAdmin
      .from('incidents')
      .update({ ai_summary: summary })
      .eq('id', req.params.id);

    await supabaseAdmin.from('ai_generations').insert({
      resource_type: 'incident', resource_id: req.params.id,
      generation_type: 'summary', output: summary,
      model: 'gpt-4o', generated_by: req.userId,
    });

    res.json({ data: { summary }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/incidents/:id/rca
router.post('/:id/rca', async (req: AuthRequest, res: Response) => {
  try {
    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('*, incident_updates(*)')
      .eq('id', req.params.id)
      .single();

    const rca = await generateRcaDraft(incident, incident.incident_updates);

    await supabaseAdmin
      .from('incidents')
      .update({ ai_rca_draft: rca })
      .eq('id', req.params.id);

    await supabaseAdmin.from('ai_generations').insert({
      resource_type: 'incident', resource_id: req.params.id,
      generation_type: 'rca_draft', output: rca,
      model: 'gpt-4o', generated_by: req.userId,
    });

    res.json({ data: { rca }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

export default router;
```

### `api/routes/backupRuns.ts`
```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

const createSchema = z.object({
  database_name: z.string().default('Heqcis_web'),
  backup_type: z.enum(['full','differential','log','filegroup']),
  status: z.enum(['success','failed','running','skipped','partial']),
  started_at: z.string().datetime().optional(),
  finished_at: z.string().datetime().optional(),
  size_bytes: z.number().optional(),
  backup_file_path: z.string().optional(),
  disk_free_bytes_before: z.number().optional(),
  disk_free_bytes_after: z.number().optional(),
  error_message: z.string().optional(),
  source: z.enum(['webhook','manual','azure_connector']).default('manual'),
});

// GET /api/backup-runs
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, database_name, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('backup_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (database_name) query = query.eq('database_name', database_name);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, error: null, meta: { total: count ?? 0, page: Number(page) } });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// GET /api/backup-runs/summary
router.get('/summary', async (_req: AuthRequest, res: Response) => {
  try {
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [{ data: runs24h }, { data: runs7d }, { data: lastSuccess }, { data: lastFail }] =
      await Promise.all([
        supabaseAdmin.from('backup_runs').select('status').gte('created_at', since24h),
        supabaseAdmin.from('backup_runs').select('status').gte('created_at', since7d),
        supabaseAdmin.from('backup_runs').select('finished_at').eq('status','success')
          .order('finished_at', { ascending: false }).limit(1),
        supabaseAdmin.from('backup_runs').select('finished_at').eq('status','failed')
          .order('finished_at', { ascending: false }).limit(1),
      ]);

    const rate = (arr: { status: string }[] | null, s: string) => {
      if (!arr || arr.length === 0) return 0;
      return Math.round((arr.filter(r => r.status === s).length / arr.length) * 100);
    };

    // Disk warning: any run in last 24h with disk_free_bytes_after < 5GB
    const { data: diskRuns } = await supabaseAdmin
      .from('backup_runs')
      .select('disk_free_bytes_after')
      .gte('created_at', since24h)
      .not('disk_free_bytes_after', 'is', null);

    const diskWarning = diskRuns?.some(r => (r.disk_free_bytes_after ?? Infinity) < 5_368_709_120) ?? false;

    res.json({
      data: {
        success_rate_24h: rate(runs24h, 'success'),
        success_rate_7d: rate(runs7d, 'success'),
        last_successful_at: lastSuccess?.[0]?.finished_at ?? null,
        last_failed_at: lastFail?.[0]?.finished_at ?? null,
        disk_warning: diskWarning,
      },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/backup-runs
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('backup_runs').insert(body).select().single();
    if (error) throw error;
    res.status(201).json({ data, error: null });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

export default router;
```

### `api/routes/changeRequests.ts`
```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { generateChangeRiskAssessment } from '../lib/ai';

const router = Router();

const createSchema = z.object({
  title: z.string().min(5),
  description: z.string().optional(),
  change_type: z.enum(['standard','normal','emergency','enhancement','patch']),
  risk_level: z.enum(['low','medium','high','critical']).optional(),
  scheduled_date: z.string().datetime().optional(),
  rollback_plan: z.string().optional(),
  impact_assessment: z.string().optional(),
});

// GET /api/change-requests
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, change_type, page = '1', limit = '20' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('change_requests')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status) query = query.eq('status', status);
    if (change_type) query = query.eq('change_type', change_type);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, error: null, meta: { total: count ?? 0, page: Number(page) } });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/change-requests
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createSchema.parse(req.body);
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from('change_requests').select('*', { count: 'exact', head: true });
    const ref = `CR-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('change_requests')
      .insert({ ...body, reference: ref, requested_by: req.userId, status: 'submitted' })
      .select().single();
    if (error) throw error;
    res.status(201).json({ data, error: null });
  } catch (err) {
    res.status(400).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/change-requests/:id/approve
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ data: null, error: 'Admin role required' });
      return;
    }
    const { comments } = req.body;
    await supabaseAdmin.from('change_request_approvals').insert({
      change_request_id: req.params.id,
      reviewer_id: req.userId,
      decision: 'approved',
      comments,
    });
    const { data, error } = await supabaseAdmin
      .from('change_requests')
      .update({ status: 'approved', approved_by: req.userId, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/change-requests/:id/reject
router.post('/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    if (req.userRole !== 'admin') {
      res.status(403).json({ data: null, error: 'Admin role required' });
      return;
    }
    const { comments } = req.body;
    await supabaseAdmin.from('change_request_approvals').insert({
      change_request_id: req.params.id,
      reviewer_id: req.userId,
      decision: 'rejected',
      comments,
    });
    const { data, error } = await supabaseAdmin
      .from('change_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select().single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/change-requests/:id/assess
router.post('/:id/assess', async (req: AuthRequest, res: Response) => {
  try {
    const { data: cr } = await supabaseAdmin
      .from('change_requests').select('*').eq('id', req.params.id).single();

    const assessment = await generateChangeRiskAssessment(cr);

    await supabaseAdmin.from('change_requests')
      .update({ ai_risk_assessment: assessment, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    await supabaseAdmin.from('ai_generations').insert({
      resource_type: 'change_request', resource_id: req.params.id,
      generation_type: 'risk_assessment', output: assessment,
      model: 'gpt-4o', generated_by: req.userId,
    });

    res.json({ data: { assessment }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

export default router;
```

### `api/routes/monthlyReports.ts`
```typescript
import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import { generateMonthlyReportDraft } from '../lib/ai';

const router = Router();

// GET /api/monthly-reports
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('monthly_reports')
      .select('id, report_period, status, prepared_by, submitted_at, created_at')
      .order('report_period', { ascending: false });
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// GET /api/monthly-reports/:period  (e.g. 2026-03)
router.get('/:period', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('monthly_reports')
      .select('*')
      .eq('report_period', req.params.period)
      .single();
    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

// POST /api/monthly-reports/generate-draft
router.post('/generate-draft', async (req: AuthRequest, res: Response) => {
  try {
    const { report_period } = req.body as { report_period: string };
    if (!report_period) {
      res.status(400).json({ data: null, error: 'report_period required (format: YYYY-MM)' });
      return;
    }

    // Gather data for the period
    const since = new Date(`${report_period}-01`).toISOString();
    const until = new Date(new Date(`${report_period}-01`).setMonth(
      new Date(`${report_period}-01`).getMonth() + 1
    )).toISOString();

    const [incidents, backups, etlRuns, changeRequests, securityFindings, popiaEvents] =
      await Promise.all([
        supabaseAdmin.from('incidents').select('*').gte('created_at', since).lt('created_at', until),
        supabaseAdmin.from('backup_runs').select('*').gte('created_at', since).lt('created_at', until),
        supabaseAdmin.from('etl_runs').select('*').gte('created_at', since).lt('created_at', until),
        supabaseAdmin.from('change_requests').select('*').gte('created_at', since).lt('created_at', until),
        supabaseAdmin.from('security_findings').select('*').gte('created_at', since).lt('created_at', until),
        supabaseAdmin.from('popia_events').select('*').gte('created_at', since).lt('created_at', until),
      ]);

    const draft = await generateMonthlyReportDraft({
      report_period,
      incidents: incidents.data ?? [],
      backups: backups.data ?? [],
      etlRuns: etlRuns.data ?? [],
      changeRequests: changeRequests.data ?? [],
      securityFindings: securityFindings.data ?? [],
      popiaEvents: popiaEvents.data ?? [],
    });

    // Upsert the monthly report record
    const { data, error } = await supabaseAdmin
      .from('monthly_reports')
      .upsert({
        report_period,
        status: 'draft',
        ...draft,
        ai_draft_generated_at: new Date().toISOString(),
        prepared_by: req.userId,
      }, { onConflict: 'report_period' })
      .select().single();

    if (error) throw error;
    res.json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: (err as Error).message });
  }
});

export default router;
```

---

## 10. Webhook Handlers

### `api/webhooks/backupResults.ts`
```typescript
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

function verifyWebhookSignature(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers['x-webhook-signature'] as string;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// POST /webhooks/backup-results
router.post('/', async (req: Request, res: Response) => {
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }
  try {
    const payload = req.body as {
      database_name?: string;
      backup_type: string;
      status: string;
      started_at?: string;
      finished_at?: string;
      size_bytes?: number;
      backup_file_path?: string;
      disk_free_bytes_before?: number;
      disk_free_bytes_after?: number;
      error_message?: string;
    };

    const { error } = await supabaseAdmin.from('backup_runs').insert({
      ...payload,
      source: 'webhook',
    });
    if (error) throw error;
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
```

### `api/webhooks/etlResults.ts`
```typescript
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();

function verifyWebhookSignature(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.headers['x-webhook-signature'] as string;
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// POST /webhooks/etl-results
router.post('/', async (req: Request, res: Response) => {
  if (!verifyWebhookSignature(req)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }
  try {
    const { error } = await supabaseAdmin.from('etl_runs').insert({
      ...req.body,
      source: 'webhook',
    });
    if (error) throw error;
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
```

---

## 11. Frontend Pages & Components

### `apps/web/src/App.tsx`
```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from './store/auth.store';

// Pages
import Dashboard from './pages/Dashboard';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import BackupHealth from './pages/BackupHealth';
import EtlHealth from './pages/EtlHealth';
import MaintenanceLog from './pages/MaintenanceLog';
import ReportRequests from './pages/ReportRequests';
import SubmissionReadiness from './pages/SubmissionReadiness';
import SecurityCompliance from './pages/SecurityCompliance';
import PopiaRegister from './pages/PopiaRegister';
import ChangeRequests from './pages/ChangeRequests';
import ChangeRequestDetail from './pages/ChangeRequestDetail';
import Documents from './pages/Documents';
import MonthlyReport from './pages/MonthlyReport';
import HandoverReadiness from './pages/HandoverReadiness';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const session = useAuthStore(s => s.session);
  return session ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PrivateRoute><AppShell /></PrivateRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="backup-health" element={<BackupHealth />} />
            <Route path="etl-health" element={<EtlHealth />} />
            <Route path="maintenance" element={<MaintenanceLog />} />
            <Route path="report-requests" element={<ReportRequests />} />
            <Route path="submission-readiness" element={<SubmissionReadiness />} />
            <Route path="security" element={<SecurityCompliance />} />
            <Route path="popia" element={<PopiaRegister />} />
            <Route path="change-requests" element={<ChangeRequests />} />
            <Route path="change-requests/:id" element={<ChangeRequestDetail />} />
            <Route path="documents" element={<Documents />} />
            <Route path="monthly-report" element={<MonthlyReport />} />
            <Route path="handover" element={<HandoverReadiness />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

### `apps/web/src/components/layout/Sidebar.tsx`
```typescript
import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'bi-grid-1x2' },
  { path: '/incidents', label: 'Service Issues', icon: 'bi-exclamation-triangle' },
  { path: '/backup-health', label: 'Backup Health', icon: 'bi-hdd-stack' },
  { path: '/etl-health', label: 'ETL Health', icon: 'bi-arrow-left-right' },
  { path: '/maintenance', label: 'Maintenance Log', icon: 'bi-tools' },
  { path: '/report-requests', label: 'Reporting Requests', icon: 'bi-file-earmark-bar-graph' },
  { path: '/submission-readiness', label: 'SAQA/NLRD Readiness', icon: 'bi-check2-circle' },
  { path: '/security', label: 'Security & Compliance', icon: 'bi-shield-lock' },
  { path: '/popia', label: 'POPIA Register', icon: 'bi-person-lock' },
  { path: '/change-requests', label: 'Change Governance', icon: 'bi-clipboard2-check' },
  { path: '/documents', label: 'Operational Runbooks', icon: 'bi-book' },
  { path: '/monthly-report', label: 'Monthly Report', icon: 'bi-file-earmark-text' },
  { path: '/handover', label: 'Handover Readiness', icon: 'bi-box-arrow-right' },
  { path: '/audit-log', label: 'Audit Log', icon: 'bi-journal-text', adminOnly: true },
];

export function Sidebar({ role }: { role: string }) {
  return (
    <nav className="d-flex flex-column bg-dark text-white vh-100 p-0" style={{ width: 260, minWidth: 260 }}>
      <div className="px-3 py-4 border-bottom border-secondary">
        <div className="fw-bold fs-6 text-white">HEQCIS Service Portal</div>
        <div className="text-secondary small">CHE Operations</div>
      </div>
      <ul className="nav flex-column gap-1 p-2 flex-grow-1 overflow-auto">
        {NAV.filter(item => !item.adminOnly || role === 'admin').map(item => (
          <li key={item.path} className="nav-item">
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `nav-link d-flex align-items-center gap-2 rounded px-3 py-2 small ${
                  isActive ? 'bg-primary text-white' : 'text-secondary'
                }`
              }
            >
              <i className={`bi ${item.icon}`} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

### `apps/web/src/pages/Dashboard.tsx`
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { KpiCard } from '../components/dashboard/KpiCard';
import { BackupSummaryCard } from '../components/dashboard/BackupSummaryCard';
import { EtlSummaryCard } from '../components/dashboard/EtlSummaryCard';
import { PageHeader } from '../components/layout/PageHeader';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorAlert } from '../components/common/ErrorAlert';

export default function Dashboard() {
  const { data: dash, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/api/dashboard'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message="Failed to load dashboard data." />;

  const d = dash?.data;

  return (
    <div>
      <PageHeader
        title="HEQCIS Service Operations"
        subtitle={`Operational snapshot · ${new Date().toLocaleDateString('en-ZA', { dateStyle: 'long' })}`}
      />

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <KpiCard label="Open Incidents" value={d?.open_incidents ?? 0}
            variant={d?.open_incidents > 0 ? 'danger' : 'success'} icon="bi-exclamation-triangle" />
        </div>
        <div className="col-md-3">
          <KpiCard label="P1/P2 Active" value={d?.critical_incidents ?? 0}
            variant={d?.critical_incidents > 0 ? 'danger' : 'success'} icon="bi-fire" />
        </div>
        <div className="col-md-3">
          <KpiCard label="Open Change Requests" value={d?.open_change_requests ?? 0}
            variant="primary" icon="bi-clipboard2-check" />
        </div>
        <div className="col-md-3">
          <KpiCard label="Security Findings" value={d?.open_security_findings ?? 0}
            variant={d?.open_security_findings > 0 ? 'warning' : 'success'} icon="bi-shield-lock" />
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <BackupSummaryCard summary={d?.backup_summary} />
        </div>
        <div className="col-md-6">
          <EtlSummaryCard summary={d?.etl_summary} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <KpiCard label="SAQA/NLRD Readiness Items Pending"
            value={d?.submission_pending ?? 0}
            variant={d?.submission_pending > 0 ? 'warning' : 'success'}
            icon="bi-check2-circle" />
        </div>
        <div className="col-md-6">
          <KpiCard label="Handover Items Outstanding"
            value={d?.handover_pending ?? 0}
            variant="info" icon="bi-box-arrow-right" />
        </div>
      </div>
    </div>
  );
}
```

### `apps/web/src/components/dashboard/KpiCard.tsx`
```typescript
interface KpiCardProps {
  label: string;
  value: number | string;
  variant: 'success' | 'danger' | 'warning' | 'primary' | 'info' | 'secondary';
  icon: string;
  subtitle?: string;
}

export function KpiCard({ label, value, variant, icon, subtitle }: KpiCardProps) {
  return (
    <div className={`card border-${variant} border-start border-4 border-top-0 border-end-0 border-bottom-0 shadow-sm`}>
      <div className="card-body d-flex align-items-center gap-3">
        <div className={`bg-${variant} bg-opacity-10 rounded p-3`}>
          <i className={`bi ${icon} fs-4 text-${variant}`} />
        </div>
        <div>
          <div className={`fs-3 fw-bold text-${variant}`}>{value}</div>
          <div className="text-muted small">{label}</div>
          {subtitle && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}
```

### `apps/web/src/components/common/StatusBadge.tsx`
```typescript
const STATUS_COLORS: Record<string, string> = {
  // Incidents
  open: 'danger', in_progress: 'warning', pending_vendor: 'secondary',
  resolved: 'success', closed: 'dark',
  // Backups / ETL
  success: 'success', failed: 'danger', running: 'primary',
  skipped: 'secondary', partial: 'warning',
  // Change Requests
  draft: 'secondary', submitted: 'info', impact_assessment: 'info',
  approved: 'success', rejected: 'danger', in_uat: 'primary',
  deployed: 'success', pir_pending: 'warning',
  // Generic
  pending: 'warning', complete: 'success', not_applicable: 'light',
  in_remediation: 'warning', remediated: 'success',
  accepted_risk: 'secondary', false_positive: 'light',
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'secondary';
  return (
    <span className={`badge bg-${color} text-${color === 'light' ? 'dark' : 'white'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
```

### `apps/web/src/services/api.ts`
```typescript
import { useAuthStore } from '../store/auth.store';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ data: T; error: string | null; meta?: { total: number; page: number } }> {
  const token = useAuthStore.getState().session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

export const api = {
  get: <T = unknown>(path: string) => request<T>('GET', path),
  post: <T = unknown>(path: string, body: unknown) => request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = unknown>(path: string) => request<T>('DELETE', path),
};
```

---

## 12. AI Integration

### `packages/ai/src/prompts/incidentSummary.ts`
```typescript
import type { Incident, IncidentUpdate } from '@sbdmog/types';

export function buildIncidentSummaryPrompt(incident: Incident, updates: IncidentUpdate[]) {
  return {
    system: `You are a senior IT operations analyst supporting the CHE HEQCIS platform.
Summarise the following service incident in clear, factual language suitable for a monthly operational report.
Do not speculate. Focus on: affected system, impact, timeline, current status, and immediate actions taken.
Write in professional South African government reporting style. Maximum 200 words.`,
    user: `Incident Reference: ${incident.reference}
Title: ${incident.title}
Category: ${incident.category}
Severity: ${incident.severity}
Status: ${incident.status}
Affected System: ${incident.affected_system ?? 'Not specified'}
Opened: ${incident.created_at}
Resolved: ${incident.resolved_at ?? 'Not yet resolved'}

Description:
${incident.description ?? 'No description provided.'}

Updates (${updates.length}):
${updates.map(u => `[${u.created_at}] ${u.content}`).join('\n') || 'No updates recorded.'}`,
  };
}
```

### `packages/ai/src/prompts/monthlyReportDraft.ts`
```typescript
export function buildMonthlyReportPrompt(context: {
  report_period: string;
  incidents: unknown[];
  backups: unknown[];
  etlRuns: unknown[];
  changeRequests: unknown[];
  securityFindings: unknown[];
  popiaEvents: unknown[];
}) {
  return {
    system: `You are a technical report writer for the CHE HEQCIS support contract.
Draft the 7 sections of the monthly operational report using the data provided.
Use formal South African government reporting language.
Each section should be 2–4 paragraphs. Mark any gaps where data is insufficient with [DATA REQUIRED].
Do not invent statistics. Only report what is supported by the data provided.`,
    user: `Report Period: ${context.report_period}

INCIDENTS (${context.incidents.length}): ${JSON.stringify(context.incidents, null, 2)}
BACKUP RUNS (${context.backups.length}): ${JSON.stringify(context.backups, null, 2)}
ETL RUNS (${context.etlRuns.length}): ${JSON.stringify(context.etlRuns, null, 2)}
CHANGE REQUESTS (${context.changeRequests.length}): ${JSON.stringify(context.changeRequests, null, 2)}
SECURITY FINDINGS (${context.securityFindings.length}): ${JSON.stringify(context.securityFindings, null, 2)}
POPIA EVENTS (${context.popiaEvents.length}): ${JSON.stringify(context.popiaEvents, null, 2)}

Draft all 7 sections:
1. System Maintenance and Operations
2. Backup and Disaster Recovery Status
3. Data Extraction and Reporting Activities
4. Security, Compliance, and Monitoring
5. Development, Enhancements, and Change Management
6. Capacity Building and Stakeholder Support
7. Risks, Issues, and Recommendations`,
  };
}
```

### `packages/ai/src/services/summarise.ts`
```typescript
import OpenAI from 'openai';
import type { Incident, IncidentUpdate } from '@sbdmog/types';
import { buildIncidentSummaryPrompt } from '../prompts/incidentSummary';
import { buildRcaDraftPrompt } from '../prompts/rcaDraft';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateIncidentSummary(
  incident: Incident,
  updates: IncidentUpdate[]
): Promise<string> {
  const { system, user } = buildIncidentSummaryPrompt(incident, updates);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return response.choices[0].message.content ?? '';
}

export async function generateRcaDraft(
  incident: Incident,
  updates: IncidentUpdate[]
): Promise<string> {
  const { system, user } = buildRcaDraftPrompt(incident, updates);
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return response.choices[0].message.content ?? '';
}
```

---

## 13. Auth & RBAC

### Roles

| Role | Permissions |
|---|---|
| `admin` | Full access, approve CRs, view audit log, manage access reviews |
| `engineer` | Create/update incidents, CRs, maintenance logs, security findings |
| `analyst` | Create/update report requests, submission readiness, documents |
| `viewer` | Read-only across all modules |

### `packages/core/src/rbac.ts`
```typescript
export type Role = 'admin' | 'engineer' | 'analyst' | 'viewer';

type Permission = {
  create?: Role[];
  update?: Role[];
  delete?: Role[];
  approve?: Role[];
  read?: Role[];
};

export const PERMISSIONS: Record<string, Permission> = {
  incidents:              { create: ['admin','engineer'], update: ['admin','engineer'] },
  backup_runs:            { create: ['admin','engineer'] },
  etl_runs:               { create: ['admin','engineer'] },
  maintenance_activities: { create: ['admin','engineer'], update: ['admin','engineer'] },
  report_requests:        { create: ['admin','engineer','analyst'], update: ['admin','engineer','analyst'] },
  submission_readiness:   { create: ['admin','engineer','analyst'], update: ['admin','engineer','analyst'] },
  security_findings:      { create: ['admin','engineer'], update: ['admin','engineer'] },
  access_reviews:         { read: ['admin'], create: ['admin'], update: ['admin'] },
  popia_events:           { create: ['admin','engineer'], update: ['admin','engineer'] },
  change_requests:        { create: ['admin','engineer','analyst'], approve: ['admin'] },
  documents:              { create: ['admin','engineer','analyst'], delete: ['admin'] },
  monthly_reports:        { create: ['admin','engineer','analyst'], update: ['admin','engineer','analyst'] },
  handover_items:         { create: ['admin','engineer'], update: ['admin','engineer'] },
  audit_logs:             { read: ['admin'] },
};

export function can(role: Role, resource: string, action: keyof Permission): boolean {
  const allowed = PERMISSIONS[resource]?.[action];
  if (!allowed) return false;
  return allowed.includes(role);
}
```

---

## 14. Environment Variables

### Server-side only (Vercel Environment Variables — never in code)

```env
SUPABASE_URL=https://nkeklgfbssxujnuzcyqu.supabase.co
SUPABASE_ANON_KEY=<from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
OPENAI_API_KEY=<regenerate after revocation>
ALLOWED_ORIGIN=https://sbdmog.vercel.app
WEBHOOK_SECRET=<random 32-char hex string>
```

### Client-side Vite (safe to expose, anon key only)

```env
VITE_SUPABASE_URL=https://nkeklgfbssxujnuzcyqu.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase dashboard>
VITE_API_BASE_URL=https://sbdmog.vercel.app
```

> ⚠️ All secrets live in Vercel Environment Variables only. Never commit `.env` files containing real values.

---

## 15. Build & Vercel Config

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

echo "==> Building shared packages"
npm run build --workspace=packages/types
npm run build --workspace=packages/core
npm run build --workspace=packages/supabase
npm run build --workspace=packages/ai

echo "==> Building React frontend"
npm run build --workspace=apps/web

echo "==> Build complete ✓"
```

### `package.json` (root)
```json
{
  "name": "sbdmog",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace=apps/web",
    "build": "bash scripts/build.sh",
    "type-check": "tsc --noEmit -p tsconfig.base.json"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "concurrently": "^8.0.0"
  }
}
```

---

## 16. Monthly Reporting Framework

The monthly report maps directly to the 7 tender-required sections:

| # | Section | Primary Data Source |
|---|---|---|
| 1 | System Maintenance and Operations | `maintenance_activities`, `incidents` |
| 2 | Backup and Disaster Recovery Status | `backup_runs` |
| 3 | Data Extraction and Reporting Activities | `report_requests`, `submission_readiness_checks` |
| 4 | Security, Compliance, and Monitoring | `security_findings`, `access_reviews`, `popia_events` |
| 5 | Development, Enhancements, and Change Management | `change_requests` |
| 6 | Capacity Building and Stakeholder Support | `documents`, `training_materials` |
| 7 | Risks, Issues, and Recommendations | `incidents` (unresolved P1/P2), `security_findings` (critical/high) |

The `/api/monthly-reports/generate-draft` endpoint:
1. Gathers all 6 data sources for the requested period
2. Passes them to the OpenAI prompt
3. GPT-4o drafts all 7 sections in one call
4. Sections are stored as Markdown in `monthly_reports` table
5. A portal user reviews, edits, and submits

---

## 17. Handover Readiness Module

Handover items are categorised and tracked from month 18 of the contract:

| Category | Description |
|---|---|
| `backup_verification` | Verified final backup sets before handover |
| `configuration_doc` | SQL Server, IIS, Pentaho configuration documentation |
| `manual` | Updated operational and user manuals |
| `architecture_artefact` | As-built diagrams, network maps, ER diagrams |
| `runbook` | Final approved operational runbooks |
| `credential_transfer` | Service account handover checklist (placeholder only — not stored in portal) |
| `knowledge_transfer_session` | Scheduled KT session records |
| `ip_transfer` | IP transfer artefact register |
| `outstanding_issue` | Open issues summary at contract end |

---

## 18. Capability Phase Map

### Phase 0 — Immediate Stabilisation (Month 1–2)
- [x] Portal scaffolding + Supabase project
- [x] Auth and RBAC
- [x] Dashboard
- [x] Incident management
- [x] Backup health monitoring + webhook ingest
- [x] ETL health monitoring + webhook ingest

### Phase 1 — Operations Baseline (Month 2–4)
- [ ] Maintenance activity log
- [ ] Report request workflow
- [ ] SAQA/NLRD submission readiness
- [ ] Change request governance
- [ ] Security findings register

### Phase 2 — Governance & Compliance (Month 4–8)
- [ ] POPIA events register
- [ ] Access review module
- [ ] Document and runbook library
- [ ] Audit log viewer

### Phase 3 — Reporting & AI (Month 6–12)
- [ ] Monthly report builder + AI draft generation
- [ ] AI incident summarisation
- [ ] AI RCA drafting
- [ ] AI change risk assessment

### Phase 4 — Handover & Knowledge Transfer (Month 18–24)
- [ ] Handover readiness tracker
- [ ] KT session logging
- [ ] IP transfer artefact register
- [ ] Contract close-out report

### Phase 5 — Azure Connectors (Optional / Future)
- [ ] Azure Logic App → SQL Agent job status → `/webhooks/sql-check-results`
- [ ] Azure Function → Pentaho ETL status polling → `/webhooks/etl-results`
- [ ] Azure scheduled backup check → `/webhooks/backup-results`

---

## 19. Coding Conventions

1. **TypeScript strict mode** everywhere. Zero `any`.
2. **Zod** validates every API request body before it touches the database.
3. **All state changes** (POST, PATCH, DELETE, approve, reject) auto-write to `audit_logs` via middleware.
4. **No AI output** directly mutates HEQCIS production data. AI outputs are stored as advisory text fields only.
5. **Webhook endpoints** are HMAC-verified using `WEBHOOK_SECRET`. Reject any unverified payload with HTTP 401.
6. **References** (INC-YYYY-NNN, CR-YYYY-NNN, etc.) are human-readable and generated server-side.
7. **React Query** for all data fetching. No manual `useEffect` fetch patterns.
8. **Bootstrap 5** classes only. No inline styles except layout overrides in `AppShell`.
9. **Comments** on all AI prompts explaining the intended tone, scope, and constraints.
10. **`.env` files** with real values must be in `.gitignore`. Secrets live in Vercel Environment Variables only.
11. **RLS** is enforced at the Supabase layer as a secondary defence. API-level RBAC is the primary control.
12. **HEQCIS production database** is never directly queried by the Vercel Function. Status is pushed in via webhooks only during Phase 0–3.

---

*Last updated: April 11, 2026 — HEQCIS_PORTAL_BUILD.md is the authoritative tender-aligned build reference. Cross-reference BLUEPRINT.md for generic stack decisions.*
