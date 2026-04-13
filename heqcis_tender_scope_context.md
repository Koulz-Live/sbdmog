# HEQCIS Tender Scope Context for GitHub Copilot

## Purpose of This File
This file provides **implementation context** for GitHub Copilot during the build of a **HEQCIS Service Operations and Enhancement Portal**.

It is intended to keep code generation aligned to the actual tender objective:

- support the **maintenance, enhancement, and development** of HEQCIS over a 24-month service period
- improve **operational assurance, monitoring, governance, reporting, documentation, and handover readiness**
- support **controlled frontend enhancement** to reduce risky direct database access
- avoid redesigning HEQCIS as a greenfield replacement platform

This project must be treated as a **support and orchestration layer around an existing live HEQCIS environment**, not as a full replacement of the transactional core.

---

## Tender-Aligned Problem Context

The existing HEQCIS environment is a live statutory system supporting learner achievement data, PHEI submissions, and SAQA/NLRD processes.

The tender context highlights these operational realities and risks:

- the current HEQCIS web application is based on **ASP.NET MVC / .NET Framework 4.7.2 / Entity Framework 6**
- the production database is **SQL Server 2019**
- the ETL pipeline is based on **Pentaho Data Integration** using `HEQCISWEB_Job`
- backups have been failing because the backup volume has insufficient free space and the current SQL backup script uses `NOINIT`
- the ETL process has a **manual restart dependency** after server reboot
- some users currently have **direct database access**, creating POPIA, audit, and integrity risk
- dormant SQL accounts and access control weaknesses must be addressed
- monthly operational reporting, documentation, training, and final handover are contractual expectations

This build must therefore support:
- **stabilisation**
- **operational monitoring**
- **issue management**
- **change governance**
- **security and compliance tracking**
- **documentation and handover**
- **selective UI enhancement for safer controlled workflows**

---

## Architecture Direction

### Primary Stack
Build with this exact stack:

- **Frontend:** React + Vite
- **Frontend Hosting:** Vercel
- **Backend/API:** Vercel Functions
- **Primary API Entrypoint:** `api/index.ts`
- **Backend Pattern:** Express-style route and middleware structure, adapted for Vercel Functions
- **Database / Auth / Storage:** Supabase Pro
- **AI:** OpenAI API
- **Azure:** optional targeted use only for SQL-related scheduled jobs and connector services
- **Language:** TypeScript
- **UI:** Bootstrap 5, clean enterprise operations UX

### Core Architectural Rule
This solution is **serverless-first, cost-conscious, and modular**.

Use:
- **Vercel** for the React app and API ingress
- **Supabase** as the operational metadata and workflow backbone
- **OpenAI** for advisory AI support such as summaries and RCA drafts
- **Azure** only where later justified for scheduled SQL checks, connector jobs, or secure polling services

Do **not**:
- replace the live HEQCIS transactional core
- move the entire solution into Azure
- build a monolith
- put long-running jobs inside Vercel Functions
- let AI directly mutate sensitive production data

---

## Delivery Intent

The portal being built should be positioned as a:

# HEQCIS Service Operations and Enhancement Portal

It must support the tender’s real delivery intent across these domains:

1. **Phase 0 Immediate Stabilisation Support**
2. **Database Maintenance and Operational Assurance**
3. **Data Extraction, Internal Reporting, and SAQA/NLRD Readiness**
4. **Security Remediation and POPIA Compliance**
5. **Change Governance and Controlled Enhancement**
6. **Technical Documentation and Training Support**
7. **Monthly Operational Reporting**
8. **End-of-Contract Handover Readiness**

---

## Scope of the Portal

### 1. Phase 0 Immediate Stabilisation Support
The portal must provide capabilities to track and support the first-wave stabilisation activities such as:

- SQL backup job audit status
- backup failure investigation
- storage threshold alerts
- backup remediation tasks
- backup health reporting
- ETL runtime health checks
- ETL restart-risk monitoring
- critical issue escalation
- SLA-oriented incident visibility

### 2. Database Maintenance and Operational Assurance
The portal must support service operations around SQL Server and environment health:

- SQL Agent job monitoring
- maintenance activity logs
- performance bottleneck logging
- integrity check findings
- storage alert history
- login and security event tracking
- root cause notes
- status dashboards for operations staff

### 3. Data Extraction, Internal Reporting, and SAQA/NLRD Support
The portal must support operational activities related to data extraction and submission readiness:

- internal reporting request workflow
- extract metadata and request logs
- SAQA/NLRD readiness checklist
- pre-submission validation tracking
- Edu.Dex validation issue log
- data quality anomaly register
- qualification mismatch investigation tracking
- reporting support notes

### 4. Security Remediation and POPIA Compliance
The portal must support ongoing governance and compliance obligations:

- direct DB access reduction tracking
- privileged access review register
- dormant account cleanup workflow
- quarterly access certification
- ROPA update tracking
- POPIA incident log
- data subject request log
- compliance evidence tracking
- monthly POPIA/security reporting support

### 5. Change Governance and Controlled Enhancement
The portal must support formal ICT governance processes:

- change request initiation
- business justification
- impact assessment
- risk assessment
- rollback planning
- approval workflow
- UAT tracking
- deployment record
- post-implementation review
- change log visibility

### 6. Documentation and Training Support
The portal must support living operational knowledge assets:

- runbooks
- backup procedures
- ETL guides
- reporting procedures
- POPIA runbooks
- architecture / as-built reference metadata
- user guides
- training materials
- workshop support artefacts
- handover documentation tracking

### 7. Monthly Operational Reporting
The portal must support structured monthly report drafting across these sections:

- system maintenance and operations
- backup and disaster recovery status
- data extraction and reporting activities
- security, compliance, and monitoring
- development, enhancements, and change management
- capacity building and stakeholder support
- risks, issues, and recommendations

### 8. Handover Readiness
The portal must track handover obligations toward contract closeout:

- verified final backups
- configuration documentation
- updated manuals and technical docs
- architecture and as-built artefacts
- operational runbooks
- knowledge transfer sessions
- IP transfer artefact register
- outstanding issues summary

---

## User Roles to Support

Design the application for role-aware access. Likely roles include:

- `admin`
- `ops_manager`
- `analyst`
- `reviewer`
- `auditor`
- `read_only`

Map functionality with least privilege in mind.

Sensitive actions must always be:
- authenticated
- authorized
- validated
- audited

---

## UX and Language Guidance

Use enterprise and tender-appropriate terminology.

Preferred module and page labels:
- **HEQCIS Service Operations**
- **Backup Health**
- **ETL Health**
- **Maintenance Activities**
- **SAQA/NLRD Readiness**
- **POPIA & Security Compliance**
- **Change Governance**
- **Operational Runbooks**
- **Monthly Operational Report**
- **Handover Readiness**

Avoid startup-style language like:
- growth hacking
- product virality
- customer success funnels
- generic SaaS boilerplate wording

The interface should feel like a **professional internal CHE operations portal**.

---

## Frontend Implementation Guidance (React + Vite + Vercel)

### Frontend Goals
Build a responsive internal operations UI with:

- left sidebar navigation
- top navbar
- page titles and breadcrumbs
- summary cards
- tables
- forms
- detail views
- timeline/history components
- status badges
- filters and search
- loading and empty states
- error banners
- toast notifications
- modal confirmations where suitable

### Required Page Areas
Prioritize these pages:

- Dashboard
- Incidents / Service Issues
- Backup Health
- ETL Health
- Maintenance Activities
- Report Requests
- SAQA/NLRD Readiness
- Security Findings
- POPIA Events
- Change Requests
- Documents / Runbooks
- Monthly Reports
- Handover Items
- Audit Logs
- Profile / Me

### Vercel-Specific Considerations
The frontend must work cleanly with Vercel SPA routing and a single API entrypoint.

The project assumes a `vercel.json` pattern similar to:

- `apps/web/dist` as the output directory
- `api/index.ts` as the single function entrypoint
- rewrites for:
  - `/api/:path*`
  - `/webhooks/:path*`
  - `/health`
  - `/readiness`
  - SPA fallback to `/index.html`

Keep frontend routes compatible with this deployment model.

---

## Backend Implementation Guidance (Vercel Functions)

### Core Backend Rule
`api/index.ts` is the **single API ingress**.

Internally, it should be structured using:
- route dispatching
- middleware patterns
- request validation
- auth middleware
- RBAC middleware
- centralized error handling
- correlation IDs
- structured JSON responses

### Backend Responsibilities
The Vercel API layer should handle:
- fast orchestration logic
- Supabase access
- OpenAI request brokering
- dashboard aggregation
- workflow updates
- webhook ingestion
- audit logging

### Do Not Put in Vercel Functions
Do not put the following in the Vercel request path if they may run long:
- heavy ETL processing
- large report generation jobs
- long-running SQL polling loops
- complex scheduled tasks

Those must be left for future targeted Azure jobs or external schedulers if needed.

---

## Supabase Responsibilities

Supabase Pro is the operational backbone of this solution.

Use Supabase for:
- authentication
- user profiles
- role mapping
- operational metadata
- workflow state
- audit logs
- AI output persistence
- document metadata
- file storage for runbooks and report artefacts

### Important Constraint
Supabase is **not** the replacement transactional HEQCIS database.

It stores the **service operations, governance, and enhancement support data model**.

---

## OpenAI Responsibilities

Use OpenAI only for advisory and assistive functions such as:

- incident summaries
- RCA draft generation
- backup failure explanation
- ETL issue explanation
- executive or monthly report drafting
- documentation assistance

### AI Safety Rules
- AI must never directly change production data
- AI output must be human-reviewed before action
- redact sensitive content before prompt submission where appropriate
- log AI generation events in the audit trail where relevant

---

## Azure Responsibilities (Optional, Narrow Scope)

Azure is optional and must remain narrowly scoped.

Use Azure only if needed later for:
- scheduled SQL health checks
- backup polling connectors
- ETL polling connectors
- secure SQL-related connector services
- webhook callback sources into the Vercel API

Azure is **not** the primary hosting platform for this build.

---

## Recommended Core Data Model

Copilot should align schema and code generation to at least these domain areas:

- `profiles`
- `roles`
- `user_roles`
- `incidents`
- `incident_updates`
- `backup_runs`
- `etl_runs`
- `maintenance_activities`
- `report_requests`
- `submission_readiness_checks`
- `submission_validation_issues`
- `security_findings`
- `access_reviews`
- `popia_events`
- `change_requests`
- `change_request_approvals`
- `documents`
- `training_materials`
- `monthly_reports`
- `handover_items`
- `audit_logs`
- `ai_generations`

Use UUID keys, timestamps, indexes, and Row Level Security.

---

## Recommended API Areas

Copilot should generate route modules compatible with a single-entry Vercel API design.

Priority route families include:

- `/health`
- `/readiness`
- `/api/me`
- `/api/dashboard`
- `/api/incidents`
- `/api/backup-runs`
- `/api/etl-runs`
- `/api/maintenance-activities`
- `/api/report-requests`
- `/api/submission-readiness`
- `/api/security-findings`
- `/api/popia-events`
- `/api/change-requests`
- `/api/documents`
- `/api/monthly-reports`
- `/api/handover-items`
- `/api/audit-logs`
- `/webhooks/sql-check-results`
- `/webhooks/backup-results`
- `/webhooks/etl-results`

---

## Non-Functional Expectations

The generated solution must be:

- modular
- typed
- secure
- auditable
- maintainable
- low-cost
- Vercel-compatible
- Supabase-first
- tender-aligned
- easy to extend over time

It must read like a **HEQCIS support and enhancement portal**, not a generic SaaS starter kit.

---

## Guidance for Copilot During Code Generation

When generating code, stay faithful to this context:

- optimize for **HEQCIS service support**
- optimize for **operational assurance**
- optimize for **controlled enhancement**
- optimize for **governance and compliance**
- optimize for **documentation, training, and handover readiness**
- keep the architecture realistic for **React (Vite) + Vercel + Supabase Pro**
- use Azure only as a future narrow connector layer if necessary

Do not drift into:
- full core system replacement
- abstract platform engineering with no tender relevance
- overbuilt microservices
- heavy Azure-first design
- generic startup CRM/product language

---

## Suggested Build Sequence

1. Project scaffolding
2. Supabase schema and RLS
3. Shared types and validators
4. `api/index.ts` router and middleware
5. Auth and role-aware frontend shell
6. Dashboard
7. Incidents
8. Backup and ETL monitoring
9. Maintenance activities
10. Reporting and submission readiness
11. Security / POPIA modules
12. Change governance
13. Documents / runbooks / training
14. Monthly reports
15. Handover tracker
16. Webhook ingestion for future connectors
17. README and deployment notes

---

## Final Implementation Reminder

This repository must help deliver a tender-aligned outcome:

> a low-cost, modern, service operations and enhancement portal that strengthens HEQCIS monitoring, governance, support workflows, compliance readiness, documentation, and controlled modernization while respecting the existing live system architecture.

Use this file as implementation context throughout the build.
