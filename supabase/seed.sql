-- =============================================================
-- HEQCIS Portal — Seed / Test Data
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- The admin profile is referenced via subquery so no UUID
-- needs to be hardcoded.
-- =============================================================

-- Convenience: resolve admin profile once
do $$ begin
  if not exists (select 1 from profiles) then
    raise exception 'No profile rows found — create an account first then re-run this seed.';
  end if;
end $$;

-- ---------------------------------------------------------------
-- INCIDENTS
-- ---------------------------------------------------------------
insert into incidents
  (id, reference, title, description, category, affected_system, severity, status, assigned_to, reported_by, sla_breach_at, created_at, updated_at)
values
(
  'a1000000-0000-0000-0000-000000000001',
  'INC-2025-001',
  'HEQCIS Web Application Unresponsive',
  'The HEQCIS web portal became unreachable for end-users at 07:15. Load balancer health-checks are failing. Initial investigation points to a memory-leak in the application tier.',
  'heqcis_app', 'HEQCIS_WEB', 'P1', 'in_progress',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  now() + interval '2 hours',
  now() - interval '3 hours',
  now() - interval '1 hour'
),
(
  'a1000000-0000-0000-0000-000000000002',
  'INC-2025-002',
  'Nightly ETL Pipeline Failure — Student Records',
  'The Pentaho ETL job "load_student_registrations" failed at 02:34 with a NullPointerException. Approximately 1 200 student records were not loaded into the HEQCIS database.',
  'etl', 'PENTAHO', 'P2', 'open',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  now() + interval '6 hours',
  now() - interval '8 hours',
  now() - interval '8 hours'
),
(
  'a1000000-0000-0000-0000-000000000003',
  'INC-2025-003',
  'SQL Server Full Backup Failed — HEQCIS_PROD',
  'Scheduled full backup at 01:00 did not complete. Backup agent reported insufficient disk space on the backup target (D:\\Backups). Only 12 GB free, 38 GB required.',
  'backup', 'HEQCIS_DB', 'P2', 'resolved',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  null,
  now() - interval '2 days',
  now() - interval '1 day'
),
(
  'a1000000-0000-0000-0000-000000000004',
  'INC-2025-004',
  'Unusual Login Attempts Detected — Admin Accounts',
  'SIEM alerted on 47 failed login attempts against three admin accounts from IP range 41.x.x.x over a 15-minute window. Accounts remain active; no successful breach detected.',
  'security', 'HEQCIS_WEB', 'P3', 'closed',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  null,
  now() - interval '5 days',
  now() - interval '4 days'
),
(
  'a1000000-0000-0000-0000-000000000005',
  'INC-2025-005',
  'Network Latency Spike Between App Tier and DB',
  'Monitoring detected average query response time of 4.2 s (baseline: 0.3 s) due to a misconfigured switch port on VLAN 20. Corrected by network team within 35 minutes.',
  'network', 'HEQCIS_DB', 'P3', 'resolved',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  null,
  now() - interval '10 days',
  now() - interval '9 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- INCIDENT UPDATES
-- ---------------------------------------------------------------
insert into incident_updates (incident_id, author_id, content, created_at)
values
(
  'a1000000-0000-0000-0000-000000000001',
  (select id from profiles limit 1),
  'Initial triage complete. Memory usage on app-server-01 is at 97%. Restarting application pool to restore service while root cause is investigated.',
  now() - interval '2 hours 30 minutes'
),
(
  'a1000000-0000-0000-0000-000000000001',
  (select id from profiles limit 1),
  'Application pool restart restored service. Heap dumps collected for analysis. Probable cause: unbounded cache in session manager. Fix being prepared.',
  now() - interval '1 hour 45 minutes'
),
(
  'a1000000-0000-0000-0000-000000000002',
  (select id from profiles limit 1),
  'Reviewed Pentaho logs. Null value in source column "qualification_end_date" for 1 200 records. Data fix script prepared and pending approval before re-run.',
  now() - interval '7 hours'
),
(
  'a1000000-0000-0000-0000-000000000002',
  (select id from profiles limit 1),
  'Data fix approved. Re-running ETL job in test environment first. ETA for prod re-run: 14:00 today.',
  now() - interval '5 hours'
),
(
  'a1000000-0000-0000-0000-000000000003',
  (select id from profiles limit 1),
  'Cleared 80 GB of old log backups from D:\\Backups. Re-scheduled full backup for 03:00. Backup completed successfully — 31.4 GB, verified.',
  now() - interval '1 day 20 hours'
)
on conflict do nothing;

-- ---------------------------------------------------------------
-- BACKUP RUNS
-- ---------------------------------------------------------------
insert into backup_runs
  (id, source, database_name, backup_type, status, started_at, finished_at,
   size_bytes, disk_free_bytes_before, disk_free_bytes_after, backup_path, error_message, created_at)
values
(
  'b1000000-0000-0000-0000-000000000001',
  'webhook', 'HEQCIS_PROD', 'full', 'success',
  now() - interval '1 day 1 hour',
  now() - interval '1 day',
  33698332672, -- ~31.4 GB
  85899345920, -- ~80 GB free before
  52201013248, -- ~48.6 GB free after
  'D:\Backups\HEQCIS_PROD_full_20250101_0300.bak',
  null,
  now() - interval '1 day'
),
(
  'b1000000-0000-0000-0000-000000000002',
  'webhook', 'HEQCIS_PROD', 'differential', 'success',
  now() - interval '12 hours 5 minutes',
  now() - interval '12 hours',
  4294967296, -- 4 GB
  52201013248,
  47906275328,
  'D:\Backups\HEQCIS_PROD_diff_20250101_1200.bak',
  null,
  now() - interval '12 hours'
),
(
  'b1000000-0000-0000-0000-000000000003',
  'webhook', 'HEQCIS_PROD', 'log', 'success',
  now() - interval '4 hours 2 minutes',
  now() - interval '4 hours',
  524288000, -- 500 MB
  47906275328,
  47382487040,
  'D:\Backups\HEQCIS_PROD_log_20250101_2000.bak',
  null,
  now() - interval '4 hours'
),
(
  'b1000000-0000-0000-0000-000000000004',
  'webhook', 'HEQCIS_PROD', 'full', 'failed',
  now() - interval '2 days 1 hour',
  now() - interval '2 days',
  0,
  12884901888, -- only 12 GB free
  12884901888,
  null,
  'Backup failed: Insufficient disk space. Required 38 GB, available 12 GB on volume D:\\.',
  now() - interval '2 days'
),
(
  'b1000000-0000-0000-0000-000000000005',
  'webhook', 'HEQCIS_REPORTING', 'full', 'success',
  now() - interval '1 day 2 hours',
  now() - interval '1 day 1 hour',
  8589934592, -- 8 GB
  107374182400,
  98784247808,
  'D:\Backups\HEQCIS_REPORTING_full_20250101_0200.bak',
  null,
  now() - interval '1 day 1 hour'
),
(
  'b1000000-0000-0000-0000-000000000006',
  'webhook', 'HEQCIS_REPORTING', 'differential', 'success',
  now() - interval '6 hours 3 minutes',
  now() - interval '6 hours',
  1073741824, -- 1 GB
  98784247808,
  97710506496,
  'D:\Backups\HEQCIS_REPORTING_diff_20250101_1800.bak',
  null,
  now() - interval '6 hours'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- ETL RUNS
-- ---------------------------------------------------------------
insert into etl_runs
  (id, source, job_name, pipeline_name, status, rows_processed, rows_failed,
   started_at, finished_at, error_message, restart_required, restart_completed_at, created_at)
values
(
  'e1000000-0000-0000-0000-000000000001',
  'webhook', 'load_student_registrations', 'HEQCIS_Nightly_Load',
  'failed', 0, 1200,
  now() - interval '8 hours 26 minutes',
  now() - interval '8 hours 20 minutes',
  'NullPointerException at step "Validate Qualification End Date": source column qualification_end_date contains null for 1200 records.',
  true, null,
  now() - interval '8 hours 20 minutes'
),
(
  'e1000000-0000-0000-0000-000000000002',
  'webhook', 'load_qualifications_registry', 'HEQCIS_Nightly_Load',
  'success', 45230, 0,
  now() - interval '8 hours 45 minutes',
  now() - interval '8 hours 26 minutes',
  null, false, null,
  now() - interval '8 hours 26 minutes'
),
(
  'e1000000-0000-0000-0000-000000000003',
  'webhook', 'load_institution_data', 'HEQCIS_Nightly_Load',
  'success', 892, 0,
  now() - interval '9 hours 10 minutes',
  now() - interval '8 hours 46 minutes',
  null, false, null,
  now() - interval '8 hours 46 minutes'
),
(
  'e1000000-0000-0000-0000-000000000004',
  'webhook', 'sync_saqa_nlrd_export', 'SAQA_Sync_Pipeline',
  'partial', 103450, 23,
  now() - interval '2 days 2 hours',
  now() - interval '2 days 1 hour',
  '23 records skipped: NLRD qualification code not found in reference table. Manual review required.',
  false, null,
  now() - interval '2 days 1 hour'
),
(
  'e1000000-0000-0000-0000-000000000005',
  'manual', 'load_student_registrations', 'HEQCIS_Nightly_Load',
  'success', 1200, 0,
  now() - interval '3 hours 30 minutes',
  now() - interval '3 hours 15 minutes',
  null, false, now() - interval '3 hours 15 minutes',
  now() - interval '3 hours 15 minutes'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- MAINTENANCE ACTIVITIES
-- ---------------------------------------------------------------
insert into maintenance_activities
  (id, title, description, activity_type, status, system_target,
   scheduled_at, completed_at, performed_by, notes, created_at, updated_at)
values
(
  'c1000000-0000-0000-0000-000000000001',
  'SQL Server Cumulative Update 14 Patch',
  'Apply SQL Server 2022 CU14 to HEQCIS_PROD database server. Requires 20-minute maintenance window.',
  'patch', 'completed', 'HEQCIS_DB',
  now() - interval '3 days',
  now() - interval '3 days' + interval '18 minutes',
  (select id from profiles limit 1),
  'Patch applied successfully. Post-patch health checks passed. No service disruption.',
  now() - interval '4 days',
  now() - interval '3 days'
),
(
  'c1000000-0000-0000-0000-000000000002',
  'Quarterly Disk Space Audit — Backup Volume',
  'Review and clean up old backup files on D:\\Backups. Target: retain last 7 full backups + 30 days of differential/log backups.',
  'audit', 'completed', 'HEQCIS_DB',
  now() - interval '2 days',
  now() - interval '1 day 22 hours',
  (select id from profiles limit 1),
  'Freed 80 GB by removing backups older than 60 days. Backup retention policy document updated.',
  now() - interval '5 days',
  now() - interval '1 day 22 hours'
),
(
  'c1000000-0000-0000-0000-000000000003',
  'HEQCIS Web Application Memory Leak Fix Deployment',
  'Deploy hotfix for unbounded session cache causing memory exhaustion on app-server-01. Requires rolling restart of IIS application pools.',
  'patch', 'in_progress', 'HEQCIS_WEB',
  now() + interval '2 hours',
  null,
  (select id from profiles limit 1),
  'Hotfix build complete. Staging environment tested. Awaiting change approval before production deployment.',
  now() - interval '1 hour',
  now() - interval '30 minutes'
),
(
  'c1000000-0000-0000-0000-000000000004',
  'Annual DR Failover Test',
  'Conduct full disaster recovery failover test to secondary site. Validate RTO ≤ 4 hours and RPO ≤ 1 hour per HEQCIS DR Plan v2.1.',
  'scheduled', 'planned', 'HEQCIS_DB',
  now() + interval '14 days',
  null,
  (select id from profiles limit 1),
  null,
  now() - interval '2 days',
  now() - interval '2 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- SECURITY FINDINGS
-- ---------------------------------------------------------------
insert into security_findings
  (id, title, description, severity, status, source, affected_system, assigned_to, due_date, created_at, updated_at)
values
(
  'd1000000-0000-0000-0000-000000000001',
  'TLS 1.0/1.1 Enabled on Web Servers',
  'Vulnerability scan identified TLS 1.0 and 1.1 protocols still active on the HEQCIS web tier. These protocols are deprecated and vulnerable to POODLE/BEAST attacks.',
  'high', 'in_remediation', 'scan', 'HEQCIS_WEB',
  (select id from profiles limit 1),
  (current_date + interval '7 days')::date,
  now() - interval '14 days',
  now() - interval '3 days'
),
(
  'd1000000-0000-0000-0000-000000000002',
  'SQL Server sa Account Active',
  'The built-in "sa" account on HEQCIS_PROD SQL Server is enabled with a weak password. This represents a critical attack surface if the server is accessible from untrusted networks.',
  'critical', 'open', 'audit', 'HEQCIS_DB',
  (select id from profiles limit 1),
  (current_date + interval '3 days')::date,
  now() - interval '7 days',
  now() - interval '7 days'
),
(
  'd1000000-0000-0000-0000-000000000003',
  'Missing HTTP Security Headers',
  'Several security headers absent from HEQCIS web responses: Content-Security-Policy, X-Frame-Options, Strict-Transport-Security. Detected by OWASP ZAP automated scan.',
  'medium', 'open', 'scan', 'HEQCIS_WEB',
  (select id from profiles limit 1),
  (current_date + interval '21 days')::date,
  now() - interval '10 days',
  now() - interval '10 days'
),
(
  'd1000000-0000-0000-0000-000000000004',
  'Unnecessary SQL Server Agent Jobs Running',
  'Several legacy SQL Agent jobs discovered that reference decommissioned systems. These should be disabled to reduce attack surface and resource consumption.',
  'low', 'remediated', 'audit', 'HEQCIS_DB',
  (select id from profiles limit 1),
  null,
  now() - interval '30 days',
  now() - interval '5 days'
),
(
  'd1000000-0000-0000-0000-000000000005',
  'Brute-Force Attempt on Admin Portal',
  'SIEM detected 47 sequential failed login attempts against admin accounts from IP 41.x.x.x block. No successful compromise. IP blocked at firewall level.',
  'high', 'remediated', 'siem', 'HEQCIS_WEB',
  (select id from profiles limit 1),
  null,
  now() - interval '5 days',
  now() - interval '4 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- POPIA EVENTS
-- ---------------------------------------------------------------
insert into popia_events
  (id, event_type, description, data_subject, reported_by, status, resolution_notes, resolved_at, created_at, updated_at)
values
(
  'f1000000-0000-0000-0000-000000000001',
  'breach',
  'An ETL misconfiguration caused student personal information (names, ID numbers) to be written to an unencrypted staging table accessible to non-authorised Pentaho service accounts.',
  'HEQCIS student population — approx. 1 200 affected records',
  (select id from profiles limit 1),
  'under_review',
  null,
  null,
  now() - interval '8 hours',
  now() - interval '2 hours'
),
(
  'f1000000-0000-0000-0000-000000000002',
  'request',
  'Data subject (student) requested deletion of personal information from HEQCIS records under POPIA Section 24. Verification of identity completed. Deletion request logged.',
  'Student ID: STU-2019-44821',
  (select id from profiles limit 1),
  'resolved',
  'Data deletion completed from HEQCIS_PROD and HEQCIS_REPORTING databases. NLRD notified per inter-agency agreement. Confirmation letter sent to data subject.',
  now() - interval '2 days',
  now() - interval '10 days',
  now() - interval '2 days'
),
(
  'f1000000-0000-0000-0000-000000000003',
  'audit',
  'Annual POPIA compliance audit initiated. Scope includes review of data processing register, consent records, and third-party data sharing agreements.',
  'All HEQCIS data subjects',
  (select id from profiles limit 1),
  'open',
  null,
  null,
  now() - interval '3 days',
  now() - interval '3 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- CHANGE REQUESTS
-- ---------------------------------------------------------------
insert into change_requests
  (id, reference, title, description, type, risk_level, status, requested_by, scheduled_date, created_at, updated_at)
values
(
  '10000000-0000-0000-0000-000000000001',
  'CR-2025-001',
  'Apply Memory Leak Hotfix to HEQCIS Web Tier',
  'Deploy patched application binaries to app-server-01 and app-server-02 to resolve the session cache memory leak identified in INC-2025-001. Requires rolling IIS restart.',
  'emergency', 'medium', 'approved',
  (select id from profiles limit 1),
  now() + interval '3 hours',
  now() - interval '2 hours',
  now() - interval '30 minutes'
),
(
  '10000000-0000-0000-0000-000000000002',
  'CR-2025-002',
  'Disable TLS 1.0/1.1 and Enforce TLS 1.2+ on Web Servers',
  'Update IIS and Windows registry settings on HEQCIS web servers to disable TLS 1.0 and 1.1. Enable TLS 1.2 and 1.3 only. Related to security finding SF-2025-001.',
  'standard', 'low', 'under_review',
  (select id from profiles limit 1),
  now() + interval '5 days',
  now() - interval '3 days',
  now() - interval '1 day'
),
(
  '10000000-0000-0000-0000-000000000003',
  'CR-2025-003',
  'Disable SQL Server sa Account on HEQCIS_PROD',
  'Disable the built-in sa account on HEQCIS_PROD SQL Server instance and rotate the password. Create a dedicated named service account for application connectivity. Related to SF-2025-002.',
  'normal', 'high', 'submitted',
  (select id from profiles limit 1),
  now() + interval '3 days',
  now() - interval '6 hours',
  now() - interval '6 hours'
),
(
  '10000000-0000-0000-0000-000000000004',
  'CR-2025-004',
  'Upgrade Pentaho ETL Server to Version 9.4',
  'Upgrade Pentaho Data Integration from v8.3 to v9.4 to benefit from improved null-handling, performance improvements, and security patches. Includes migration of existing jobs/transformations.',
  'normal', 'medium', 'draft',
  (select id from profiles limit 1),
  now() + interval '30 days',
  now() - interval '1 day',
  now() - interval '1 day'
)
on conflict (id) do nothing;

-- Change request approvals
insert into change_request_approvals
  (change_request_id, approver_id, decision, comments, decided_at)
values
(
  '10000000-0000-0000-0000-000000000001',
  (select id from profiles limit 1),
  'approved',
  'Emergency change approved. Hotfix tested in staging for 4 hours with no regression. Proceed with immediate deployment.',
  now() - interval '45 minutes'
)
on conflict do nothing;

-- ---------------------------------------------------------------
-- REPORT REQUESTS
-- ---------------------------------------------------------------
insert into report_requests
  (id, title, description, requester_id, assigned_to, priority, status, due_date, created_at, updated_at)
values
(
  '20000000-0000-0000-0000-000000000001',
  'Q4 2024 HEQCIS Operational Summary',
  'Quarterly operational report covering incidents, backup/ETL performance, security posture, and POPIA compliance for the period October–December 2024.',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  'high', 'in_progress',
  current_date + 7,
  now() - interval '5 days',
  now() - interval '2 days'
),
(
  '20000000-0000-0000-0000-000000000002',
  'SAQA NLRD Data Submission Readiness Report',
  'Ad-hoc report assessing readiness of student qualification data for the upcoming SAQA NLRD submission. Identify gaps and remediation actions required.',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  'urgent', 'submitted',
  current_date + 3,
  now() - interval '1 day',
  now() - interval '1 day'
),
(
  '20000000-0000-0000-0000-000000000003',
  'January 2025 Monthly Operational Report',
  'Standard monthly report for January 2025 covering all operational domains per the HEQCIS reporting template.',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  'normal', 'delivered',
  current_date - 5,
  now() - interval '15 days',
  now() - interval '2 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- SUBMISSION READINESS CHECKS
-- ---------------------------------------------------------------
insert into submission_readiness_checks
  (id, submission_type, period, overall_status, checked_by, notes, checked_at, created_at)
values
(
  '30000000-0000-0000-0000-000000000001',
  'SAQA_NLRD', '2024-Q4', 'blocked',
  (select id from profiles limit 1),
  'Blocked pending resolution of 1 200 student records with null qualification_end_date (see INC-2025-002). ETL re-run required before submission.',
  now() - interval '6 hours',
  now() - interval '6 hours'
),
(
  '30000000-0000-0000-0000-000000000002',
  'DHET_STATS', '2024-Annual', 'ready',
  (select id from profiles limit 1),
  'All 45 230 qualification records validated. DHET submission package generated and signed off by data steward.',
  now() - interval '3 days',
  now() - interval '5 days'
)
on conflict (id) do nothing;

-- Submission validation issues
insert into submission_validation_issues
  (check_id, field_name, issue_type, description, resolved, created_at)
values
(
  '30000000-0000-0000-0000-000000000001',
  'qualification_end_date',
  'null_value',
  '1 200 records have NULL qualification_end_date. SAQA NLRD schema requires this field for all completed qualifications.',
  false,
  now() - interval '6 hours'
),
(
  '30000000-0000-0000-0000-000000000001',
  'nlrd_qualification_code',
  'reference_mismatch',
  '23 records reference NLRD qualification codes not present in the SAQA reference table. Manual review required.',
  false,
  now() - interval '6 hours'
)
on conflict do nothing;

-- ---------------------------------------------------------------
-- DOCUMENTS
-- ---------------------------------------------------------------
insert into documents
  (id, title, slug, doc_type, content, category, tags, version, author_id, last_updated_by, created_at, updated_at)
values
(
  '40000000-0000-0000-0000-000000000001',
  'HEQCIS SQL Server Backup & Recovery Runbook',
  'heqcis-sql-backup-recovery-runbook',
  'runbook',
  '# HEQCIS SQL Server Backup & Recovery Runbook

## Purpose
This runbook defines the procedures for managing, monitoring, and restoring SQL Server backups for the HEQCIS production environment.

## Backup Schedule
- **Full backup**: Daily at 01:00 (D:\Backups\HEQCIS_PROD_full_YYYYMMDD_HHMM.bak)
- **Differential backup**: Every 12 hours at 12:00 and 00:00
- **Transaction log backup**: Every 4 hours

## Recovery Procedure
1. Identify the latest successful full backup
2. Apply the most recent differential backup
3. Apply transaction log backups in sequence
4. Verify database integrity with DBCC CHECKDB
5. Update application connection strings if required

## Escalation
P1 backup failures: notify DBA on-call within 15 minutes.',
  'Database Operations',
  ARRAY['sql-server','backup','recovery','runbook'],
  '1.2',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  now() - interval '30 days',
  now() - interval '2 days'
),
(
  '40000000-0000-0000-0000-000000000002',
  'Pentaho ETL Troubleshooting Guide',
  'pentaho-etl-troubleshooting-guide',
  'runbook',
  '# Pentaho ETL Troubleshooting Guide

## Common Failures

### NullPointerException in Transformation Steps
- Check source data for NULL values in mandatory fields
- Review the "Validate" step configuration
- Enable "Pass rows on error" to isolate failing rows

### Job Hangs / No Progress
- Check Pentaho server logs at /opt/pentaho/logs/
- Verify HEQCIS_DB connectivity from ETL server
- Restart Pentaho Data Integration service if required

## Restart Procedure
1. Log into ETL server
2. Run: `service pentaho-di restart`
3. Re-trigger failed job from Pentaho console
4. Monitor row counts in the Operations portal',
  'ETL Operations',
  ARRAY['pentaho','etl','troubleshooting','runbook'],
  '2.0',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  now() - interval '60 days',
  now() - interval '14 days'
),
(
  '40000000-0000-0000-0000-000000000003',
  'HEQCIS POPIA Compliance Policy',
  'heqcis-popia-compliance-policy',
  'policy',
  '# HEQCIS POPIA Compliance Policy v1.1

## Scope
All personal information processed within the HEQCIS system, including student qualification records, institutional data, and user account information.

## Key Principles
1. **Lawfulness** — Data processing is based on consent or legitimate interest
2. **Purpose limitation** — Data collected only for SAQA/DHET reporting purposes
3. **Data minimisation** — Only fields required for submissions are retained
4. **Accuracy** — Monthly data quality checks enforced
5. **Storage limitation** — Retention: 7 years for qualification records, 3 years for operational logs

## Breach Response
Suspected breaches must be reported to the Information Officer within 24 hours.',
  'Compliance',
  ARRAY['popia','compliance','policy','data-protection'],
  '1.1',
  (select id from profiles limit 1),
  (select id from profiles limit 1),
  now() - interval '90 days',
  now() - interval '30 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- MONTHLY REPORTS
-- ---------------------------------------------------------------
insert into monthly_reports
  (id, period, status, section_executive_summary, section_incidents,
   section_backup_etl, section_change_requests, section_security_popia,
   section_submission_readiness, section_upcoming_work,
   prepared_by, created_at, updated_at)
values
(
  '50000000-0000-0000-0000-000000000001',
  '2025-01',
  'draft',
  'January 2025 saw increased operational activity driven by a P1 web application incident and an ETL failure affecting 1 200 student records. Both incidents were resolved within SLA. Security posture improved following remediation of 2 legacy vulnerabilities.',
  '5 incidents recorded (1x P1, 2x P2, 2x P3). P1 resolved in 3h 45m. ETL-related P2 re-run completed successfully. No SLA breaches.',
  '6 backup runs completed; 1 full backup failed due to disk space (resolved). 5 ETL jobs: 3 success, 1 partial, 1 failed and re-run successfully.',
  '4 change requests raised: 1 emergency approved and implemented, 1 under review, 1 submitted, 1 in draft.',
  '5 security findings tracked: 1 critical (sa account), 2 high, 1 medium, 1 low. 2 remediated this month. 3 POPIA events: 1 breach under review, 1 deletion request resolved, 1 audit in progress.',
  'SAQA NLRD Q4 submission blocked pending ETL data fix. DHET Annual Statistics ready for submission.',
  'Scheduled: Annual DR failover test (Day 15). Planned: Pentaho ETL upgrade (Day 30). Pending: CR-2025-002 TLS hardening.',
  (select id from profiles limit 1),
  now() - interval '1 day',
  now() - interval '30 minutes'
),
(
  '50000000-0000-0000-0000-000000000002',
  '2024-12',
  'published',
  'December 2024 was an operationally stable month. No P1 incidents. Successful completion of year-end data preparation for DHET Annual Statistics submission.',
  '2 incidents recorded (both P3). Resolved within 24 hours. No SLA breaches.',
  'All backup jobs completed successfully across the month. ETL pipeline achieved 99.2% success rate (4 partial runs due to source system delays).',
  '2 standard change requests implemented: IIS configuration update and SQL Server patch.',
  '1 medium security finding identified and remediated (legacy SQL Agent jobs). No POPIA events.',
  'DHET Annual Statistics: data preparation complete, submission scheduled for January. SAQA NLRD Q4 data validation in progress.',
  'Q1 2025: Annual DR failover test. Pentaho ETL upgrade planning. TLS hardening assessment.',
  (select id from profiles limit 1),
  now() - interval '35 days',
  now() - interval '5 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- HANDOVER ITEMS
-- ---------------------------------------------------------------
insert into handover_items
  (id, category, title, description, status, owner_id, target_date, notes, created_at, updated_at)
values
(
  '60000000-0000-0000-0000-000000000001',
  'knowledge',
  'SQL Server DBA Knowledge Transfer',
  'Transfer operational knowledge of HEQCIS SQL Server environment to incoming DBA. Includes backup procedures, maintenance plans, and escalation contacts.',
  'in_progress',
  (select id from profiles limit 1),
  current_date + 14,
  '3 of 8 knowledge transfer sessions completed. Topics covered: backup/restore, index maintenance, monitoring dashboards.',
  now() - interval '10 days',
  now() - interval '2 days'
),
(
  '60000000-0000-0000-0000-000000000002',
  'documentation',
  'Update System Architecture Diagrams',
  'Current architecture diagrams are outdated (v2019). Update to reflect current infrastructure including ETL server, secondary replica, and monitoring stack.',
  'pending',
  (select id from profiles limit 1),
  current_date + 21,
  null,
  now() - interval '5 days',
  now() - interval '5 days'
),
(
  '60000000-0000-0000-0000-000000000003',
  'access',
  'Transfer Admin Credentials to Service Accounts',
  'Replace shared admin credentials with individual named service accounts. Document all system access points and credential vault locations.',
  'completed',
  (select id from profiles limit 1),
  current_date - 7,
  'All production system access transferred to named accounts. CyberArk vault updated. Shared credentials rotated.',
  now() - interval '20 days',
  now() - interval '8 days'
),
(
  '60000000-0000-0000-0000-000000000004',
  'process',
  'Document Incident Response Workflow',
  'Formalise and document the end-to-end incident response process: detection, triage, escalation, resolution, and post-incident review.',
  'pending',
  (select id from profiles limit 1),
  current_date + 30,
  null,
  now() - interval '3 days',
  now() - interval '3 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- ACCESS REVIEWS
-- ---------------------------------------------------------------
insert into access_reviews
  (id, period, system_name, reviewed_by, status, findings, completed_at, created_at)
values
(
  '70000000-0000-0000-0000-000000000001',
  '2024-Q4', 'HEQCIS_PROD SQL Server',
  (select id from profiles limit 1),
  'completed',
  '12 user accounts reviewed. 3 terminated-employee accounts found and disabled. 2 service accounts with excessive sysadmin rights downgraded to db_datareader/db_datawriter.',
  now() - interval '10 days',
  now() - interval '30 days'
),
(
  '70000000-0000-0000-0000-000000000002',
  '2024-Q4', 'HEQCIS Web Application',
  (select id from profiles limit 1),
  'completed',
  '28 user accounts reviewed. 4 inactive accounts disabled. Admin role confirmed for 2 users only.',
  now() - interval '10 days',
  now() - interval '30 days'
),
(
  '70000000-0000-0000-0000-000000000003',
  '2025-Q1', 'Pentaho ETL Server',
  (select id from profiles limit 1),
  'in_progress',
  null,
  null,
  now() - interval '2 days'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- AI GENERATIONS (sample history)
-- ---------------------------------------------------------------
insert into ai_generations
  (resource_type, resource_id, prompt_type, prompt_tokens, completion_tokens,
   model, output, accepted, created_by, created_at)
values
(
  'incident', 'a1000000-0000-0000-0000-000000000001',
  'summary', 412, 186,
  'gpt-4o',
  'P1 incident: HEQCIS web portal became unresponsive at 07:15 due to a memory exhaustion event on app-server-01 (session cache leak). Service was restored within 45 minutes via application pool restart. Root cause: unbounded in-memory cache in the session manager component. Hotfix in progress (CR-2025-001).',
  true,
  (select id from profiles limit 1),
  now() - interval '2 hours'
),
(
  'incident', 'a1000000-0000-0000-0000-000000000002',
  'rca_draft', 890, 420,
  'gpt-4o',
  '## Root Cause Analysis — INC-2025-002

**Incident:** Nightly ETL Pipeline Failure — Student Records
**Timeline:** Job started 02:34, failed at 02:40. 1 200 records not loaded.

**Root Cause:** The Pentaho transformation step "Validate Qualification End Date" encountered NULL values for 1 200 source records. The step was configured to abort on null rather than log and skip, causing the entire job to terminate.

**Contributing Factors:**
1. Source data quality issue — qualification_end_date not populated for in-progress qualifications
2. ETL validation logic did not distinguish between completed and in-progress qualifications
3. No alerting configured for partial-load scenarios

**Corrective Actions:**
1. (Immediate) Fix source NULL values and re-run job
2. (Short-term) Update validation step to handle in-progress qualifications gracefully
3. (Long-term) Implement data quality gate before ETL pipeline execution',
  true,
  (select id from profiles limit 1),
  now() - interval '7 hours'
)
on conflict do nothing;

-- ---------------------------------------------------------------
-- AUDIT LOGS
-- ---------------------------------------------------------------
insert into audit_logs
  (actor_id, action, resource_type, resource_id, metadata, created_at)
values
(
  (select id from profiles limit 1),
  'create', 'incident', 'a1000000-0000-0000-0000-000000000001',
  '{"reference": "INC-2025-001", "severity": "P1"}'::jsonb,
  now() - interval '3 hours'
),
(
  (select id from profiles limit 1),
  'update', 'incident', 'a1000000-0000-0000-0000-000000000001',
  '{"field": "status", "old": "open", "new": "in_progress"}'::jsonb,
  now() - interval '2 hours 30 minutes'
),
(
  (select id from profiles limit 1),
  'approve', 'change_request', '10000000-0000-0000-0000-000000000001',
  '{"reference": "CR-2025-001", "decision": "approved"}'::jsonb,
  now() - interval '45 minutes'
),
(
  (select id from profiles limit 1),
  'create', 'security_finding', 'd1000000-0000-0000-0000-000000000002',
  '{"title": "SQL Server sa Account Active", "severity": "critical"}'::jsonb,
  now() - interval '7 days'
),
(
  (select id from profiles limit 1),
  'create', 'popia_event', 'f1000000-0000-0000-0000-000000000001',
  '{"event_type": "breach", "data_subject": "~1200 student records"}'::jsonb,
  now() - interval '8 hours'
)
on conflict do nothing;

-- =============================================================
-- Seed complete. Expected row counts:
--   incidents:                     5
--   incident_updates:              5
--   backup_runs:                   6
--   etl_runs:                      5
--   maintenance_activities:        4
--   security_findings:             5
--   popia_events:                  3
--   change_requests:               4
--   change_request_approvals:      1
--   report_requests:               3
--   submission_readiness_checks:   2
--   submission_validation_issues:  2
--   documents:                     3
--   monthly_reports:               2
--   handover_items:                4
--   access_reviews:                3
--   ai_generations:                2
--   audit_logs:                    5
-- =============================================================
