// apps/web/src/services/activityLogger.ts
// Fire-and-forget helper for recording user session events to the backend.
// Used by Login.tsx (login / login_failed) and useAuth.ts (logout).
// Does NOT require a JWT — hits the /activity/user unauthenticated endpoint.

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export type UserActivityEvent = 'login' | 'logout' | 'login_failed';

export interface UserActivityPayload {
  user_id?:  string;
  email?:    string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a user session event. Fire-and-forget — never throws.
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
