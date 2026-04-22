// apps/web/src/services/activityLogger.ts
// Fire-and-forget helpers for recording client-side events to the backend.
//
// logUserActivity — unauthenticated, login/logout/login_failed only.
// trackEvent      — authenticated (attaches JWT), any AuditAction.

import { useAuthStore } from '../store/auth.store.js';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export type UserActivityEvent = 'login' | 'logout' | 'login_failed';

export interface UserActivityPayload {
  user_id?:  string;
  email?:    string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a user session event (unauthenticated). Fire-and-forget — never throws.
 */
export function logUserActivity(
  event:    UserActivityEvent,
  payload?: UserActivityPayload,
): void {
  void fetch(`${BASE_URL}/activity/user`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event, ...payload }),
  }).catch((err) => {
    console.warn('[activityLogger] failed to record event:', event, err);
  });
}

// ── Authenticated client-side event tracking ─────────────────────────────────

export type ClientTrackAction =
  | 'view' | 'page_view' | 'search' | 'export' | 'download'
  | 'upload' | 'ai_generate' | 'ai_analyse';

export interface TrackEventPayload {
  resource_type?: string;
  resource_id?:   string;
  metadata?:      Record<string, unknown>;
  page?:          string;
}

/**
 * Record an arbitrary client-side user action.
 * Automatically attaches the current JWT. Fire-and-forget — never throws.
 *
 * @example
 *   trackEvent('export', { resource_type: 'backup_runs', metadata: { format: 'csv' } });
 *   trackEvent('page_view', { page: '/incidents' });
 */
export function trackEvent(
  action:   ClientTrackAction,
  payload?: TrackEventPayload,
): void {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  void fetch(`${BASE_URL}/activity/track`, {
    method:  'POST',
    headers,
    body:    JSON.stringify({ action, ...payload }),
  }).catch((err) => {
    console.warn('[activityLogger] failed to track event:', action, err);
  });
}
