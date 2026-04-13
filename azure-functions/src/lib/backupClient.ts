// azure-functions/src/lib/backupClient.ts
// Backup inspection client for the HEQCIS connector.
//
// Reads SQL Server msdb backup history to determine:
//   - last backup timestamp and type
//   - backup size
//   - failure status
//   - NOINIT risk (overlapping chain corruption)
//   - disk free space (if configured)
//
// NOINIT RISK:
//   The known issue in the HEQCIS environment is that SQL backup scripts
//   use NOINIT, which appends to the backup file instead of overwriting,
//   causing backup chain corruption over time. This connector flags that
//   pattern by checking for repeated backup_start_date deltas < 60s on
//   the same backup device. The remediation note is set statically if detected.

import type { SqlConfig } from '../common/config.js';
import type { BackupCheckResult } from '../common/types.js';
import { runQuery } from './sqlClient.js';
import { logger } from '../common/logger.js';

const CONTEXT = 'backupClient';

// ─── Types for raw msdb rows ──────────────────────────────────────────────────

interface BackupSetRow {
  database_name:       string;
  backup_start_date:   Date | string | null;
  backup_finish_date:  Date | string | null;
  type:                string | null; // 'D'=full, 'I'=diff, 'L'=log
  backup_size:         number | null;
  is_damaged:          boolean | number | null;
}

function mapBackupType(raw: string | null): 'full' | 'differential' | 'log' | null {
  switch ((raw ?? '').toUpperCase()) {
    case 'D': return 'full';
    case 'I': return 'differential';
    case 'L': return 'log';
    default:  return null;
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Run backup health checks against msdb.dbo.backupset.
 * Returns a normalised BackupCheckResult — never throws.
 */
export async function runBackupCheck(cfg: SqlConfig): Promise<BackupCheckResult> {
  const checkedAt = new Date().toISOString();
  const dbName    = cfg.database;

  logger.info(CONTEXT, `Running backup check for database "${dbName}"`);

  const result = await runQuery(cfg, cfg.backupQuery);

  if (result.error !== null) {
    logger.error(CONTEXT, `Backup query failed: ${result.error}`);
    return {
      status:                     'failed',
      database_name:              dbName,
      last_backup_at:             null,
      last_failure_at:            null,
      last_backup_type:           null,
      last_backup_size_bytes:     null,
      last_backup_duration_seconds: null,
      noinit_risk_detected:       false,
      disk_free_bytes:            null,
      error_message:              result.error,
      remediation_note:           null,
      checked_at:                 checkedAt,
    };
  }

  if (result.rows.length === 0) {
    logger.warn(CONTEXT, `No backup records found for database "${dbName}"`);
    return {
      status:                     'warning',
      database_name:              dbName,
      last_backup_at:             null,
      last_failure_at:            null,
      last_backup_type:           null,
      last_backup_size_bytes:     null,
      last_backup_duration_seconds: null,
      noinit_risk_detected:       false,
      disk_free_bytes:            null,
      error_message:              'No backup records found in msdb.dbo.backupset.',
      remediation_note:           'Verify that SQL Agent backup jobs are scheduled and running.',
      checked_at:                 checkedAt,
    };
  }

  const rows = result.rows as unknown as BackupSetRow[];
  const latest = rows[0];

  const startDate   = toIso(latest.backup_start_date);
  const finishDate  = toIso(latest.backup_finish_date);
  const isDamaged   = latest.is_damaged === true || latest.is_damaged === 1;
  const backupType  = mapBackupType(latest.type);

  // Duration in seconds
  let durationSeconds: number | null = null;
  if (startDate && finishDate) {
    durationSeconds = Math.round(
      (new Date(finishDate).getTime() - new Date(startDate).getTime()) / 1000,
    );
    if (durationSeconds < 0) durationSeconds = null;
  }

  // NOINIT detection: if two consecutive backups are < 60 seconds apart on same DB,
  // it's a strong indicator the backup file is being appended via NOINIT.
  let noinit_risk_detected = false;
  if (rows.length >= 2) {
    const t0 = rows[0].backup_start_date ? new Date(rows[0].backup_start_date).getTime() : null;
    const t1 = rows[1].backup_start_date ? new Date(rows[1].backup_start_date).getTime() : null;
    if (t0 !== null && t1 !== null) {
      const deltaSec = Math.abs(t0 - t1) / 1000;
      if (deltaSec < 60 && rows[0].type === rows[1].type) {
        noinit_risk_detected = true;
        logger.warn(CONTEXT, `NOINIT risk detected: consecutive backups ${deltaSec}s apart (same type)`);
      }
    }
  }

  let status: BackupCheckResult['status'] = 'success';
  let remediationNote: string | null = null;

  if (isDamaged) {
    status          = 'failed';
    remediationNote = 'Backup is marked as damaged in msdb. Investigate SQL Agent logs immediately.';
  } else if (noinit_risk_detected) {
    status          = 'warning';
    remediationNote = 'NOINIT risk detected. Update the backup script to use INIT to prevent chain corruption.';
  } else if (!startDate) {
    status          = 'warning';
    remediationNote = 'Last backup start time is null — backup job may not have completed.';
  }

  // Stale backup detection: flag if the last backup is > 25 hours old
  if (status === 'success' && startDate) {
    const ageHours = (Date.now() - new Date(startDate).getTime()) / 3_600_000;
    if (ageHours > 25) {
      status          = 'warning';
      remediationNote = `Last backup is ${ageHours.toFixed(1)}h old (threshold: 25h). Check SQL Agent schedule.`;
      logger.warn(CONTEXT, remediationNote);
    }
  }

  return {
    status,
    database_name:               dbName,
    last_backup_at:              startDate,
    last_failure_at:             isDamaged ? startDate : null,
    last_backup_type:            backupType,
    last_backup_size_bytes:      latest.backup_size ?? null,
    last_backup_duration_seconds: durationSeconds,
    noinit_risk_detected,
    disk_free_bytes:             null, // populated only if a disk space query is configured
    error_message:               isDamaged ? 'Backup is marked as damaged.' : null,
    remediation_note:            remediationNote,
    checked_at:                  checkedAt,
  };
}
