// apps/web/src/hooks/useBackupTrigger.ts
// React Query mutation hook for triggering a manual backup run.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../services/api.js';
import type { BackupRun } from '@heqcis/types';

interface TriggerBackupInput {
  backup_type:   'full' | 'differential' | 'log';
  database_name: string;
}

interface TriggerBackupResponse {
  data: BackupRun;
}

export function useBackupTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TriggerBackupInput) =>
      apiPost<TriggerBackupResponse>('/backup-runs/trigger', body),
    onSuccess: () => {
      // Refresh the backup runs list and the dashboard SQL stats
      qc.invalidateQueries({ queryKey: ['backupRuns'] });
      qc.invalidateQueries({ queryKey: ['sql-stats'] });
    },
  });
}
