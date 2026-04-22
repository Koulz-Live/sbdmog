// apps/web/src/hooks/useAuditTrack.ts
// Provides a stable `track()` function for recording explicit user actions
// (export, search, AI generate, etc.) from any page component.

import { useCallback } from 'react';
import { trackEvent, type ClientTrackAction, type TrackEventPayload } from '../services/activityLogger.js';

/**
 * Returns a stable `track(action, payload?)` callback.
 *
 * @example
 *   const track = useAuditTrack();
 *   // Inside an export button handler:
 *   track('export', { resource_type: 'backup_runs', metadata: { format: 'csv', rows: data.length } });
 */
export function useAuditTrack() {
  return useCallback(
    (action: ClientTrackAction, payload?: TrackEventPayload) => {
      trackEvent(action, payload);
    },
    [],
  );
}
