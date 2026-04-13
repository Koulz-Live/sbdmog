// azure-functions/src/lib/etlClient.ts
// ETL state inspection client for the HEQCIS connector.
//
// Queries SQL Server Agent job history for HEQCISWEB_Job status.
// Does NOT interact with Pentaho directly — only inspects the SQL Agent
// job that wraps/triggers the Pentaho ETL pipeline.
//
// PENTAHO NOTE:
//   Pentaho Data Integration (HEQCISWEB_Job) is invoked via a SQL Agent
//   job step. This connector reads the SQL Agent job history from msdb,
//   which provides the last run status, timestamps, and error messages
//   at the job level. Pentaho-level step details would require log file
//   parsing or the Pentaho Carte REST API — both are out of scope here.
//
// RESTART RISK:
//   The known issue is that HEQCISWEB_Job does not auto-restart after
//   server reboot. This connector flags the job as requiring restart if
//   the SQL Agent shows the job as not currently running and the last
//   recorded execution was before a threshold (default: 4 hours).

import type { SqlConfig } from '../common/config.js';
import type { EtlCheckResult } from '../common/types.js';
import { runQuery } from './sqlClient.js';
import { logger } from '../common/logger.js';

const CONTEXT = 'etlClient';

// ─── Raw msdb row types ───────────────────────────────────────────────────────

interface SysJobHistoryRow {
  job_id:          string;
  name:            string;
  enabled:         boolean | number;
  date_created:    Date | string | null;
  run_date:        number | null; // YYYYMMDD
  run_time:        number | null; // HHMMSS
  run_status:      number | null; // 0=failed, 1=success, 2=retry, 3=cancelled, 4=running
  message:         string | null;
}

/**
 * Convert msdb YYYYMMDD + HHMMSS integer pair to ISO string.
 */
function msdbDateToIso(run_date: number | null, run_time: number | null): string | null {
  if (!run_date) return null;
  const ds = String(run_date).padStart(8, '0');
  const ts = String(run_time ?? 0).padStart(6, '0');
  const year  = ds.slice(0, 4);
  const month = ds.slice(4, 6);
  const day   = ds.slice(6, 8);
  const hour  = ts.slice(0, 2);
  const min   = ts.slice(2, 4);
  const sec   = ts.slice(4, 6);
  const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
  const d   = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Determine restart_required based on the job's enabled flag,
 * last run status, and elapsed time since the last run.
 *
 * Flags restart_required = true if:
 *   - The SQL Agent job is enabled (i.e. supposed to be running)
 *   - AND the last status is NOT success (1)
 *   - AND the last run was more than staleThresholdHours ago
 */
function deriveRestartRequired(
  enabled: boolean | number,
  runStatus: number | null,
  lastRunAt: string | null,
  staleThresholdHours = 4,
): boolean {
  if (!enabled) return false;
  if (runStatus === 1) return false; // last run was success
  if (!lastRunAt) return true;       // never ran or no history
  const ageHours = (Date.now() - new Date(lastRunAt).getTime()) / 3_600_000;
  return ageHours > staleThresholdHours;
}

/**
 * Run ETL health check by querying SQL Agent job history.
 * Returns a normalised EtlCheckResult — never throws.
 */
export async function runEtlCheck(cfg: SqlConfig): Promise<EtlCheckResult> {
  const checkedAt = new Date().toISOString();
  const jobName   = cfg.etlJobName;

  logger.info(CONTEXT, `Running ETL check for job "${jobName}"`);

  const result = await runQuery(cfg, cfg.etlQuery);

  if (result.error !== null) {
    logger.error(CONTEXT, `ETL query failed: ${result.error}`);
    return {
      status:           'unknown',
      job_name:         jobName,
      last_success_at:  null,
      last_failure_at:  null,
      restart_required: false,
      backlog_rows:     null,
      rows_processed:   null,
      rows_failed:      null,
      failure_reason:   result.error,
      notes:            'Query to msdb.dbo.sysjobhistory failed.',
      checked_at:       checkedAt,
    };
  }

  if (result.rows.length === 0) {
    logger.warn(CONTEXT, `No job history found for "${jobName}"`);
    return {
      status:           'unknown',
      job_name:         jobName,
      last_success_at:  null,
      last_failure_at:  null,
      restart_required: true,
      backlog_rows:     null,
      rows_processed:   null,
      rows_failed:      null,
      failure_reason:   null,
      notes:            `No SQL Agent job history found for "${jobName}". The job may never have run on this server.`,
      checked_at:       checkedAt,
    };
  }

  const rows = result.rows as unknown as SysJobHistoryRow[];
  const latest  = rows[0];
  const enabled = !!latest.enabled;

  const lastRunAt   = msdbDateToIso(latest.run_date, latest.run_time);
  const runStatus   = latest.run_status;  // 0=failed, 1=success, 3=cancelled, 4=running

  // Find the most recent success
  const lastSuccess = rows.find((r) => r.run_status === 1);
  const lastSuccessAt = lastSuccess
    ? msdbDateToIso(lastSuccess.run_date, lastSuccess.run_time)
    : null;

  // Find the most recent failure
  const lastFailure = rows.find((r) => r.run_status === 0);
  const lastFailureAt = lastFailure
    ? msdbDateToIso(lastFailure.run_date, lastFailure.run_time)
    : null;

  const restartRequired = deriveRestartRequired(enabled, runStatus, lastRunAt);
  if (restartRequired) {
    logger.warn(CONTEXT, `Restart required for job "${jobName}" (runStatus=${runStatus}, lastRun=${lastRunAt})`);
  }

  let status: EtlCheckResult['status'];
  if (runStatus === 4) {
    status = 'running';
  } else if (runStatus === 1) {
    status = 'idle';
  } else if (runStatus === 0) {
    status = 'failed';
  } else if (restartRequired) {
    status = 'stale';
  } else {
    status = 'unknown';
  }

  const failureReason = (runStatus === 0 && latest.message)
    ? latest.message.slice(0, 500)
    : null;

  const notes = [
    enabled ? `Job is enabled.` : `Job is DISABLED in SQL Agent — check scheduled configuration.`,
    restartRequired ? `Job requires manual restart.` : null,
  ].filter(Boolean).join(' ');

  return {
    status,
    job_name:        jobName,
    last_success_at: lastSuccessAt,
    last_failure_at: lastFailureAt,
    restart_required: restartRequired,
    backlog_rows:    null, // cannot determine without Pentaho log access
    rows_processed:  null, // not available from SQL Agent job history alone
    rows_failed:     null,
    failure_reason:  failureReason,
    notes:           notes || null,
    checked_at:      checkedAt,
  };
}
