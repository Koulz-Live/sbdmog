// apps/web/src/hooks/usePageView.ts
// Fires a 'page_view' audit event whenever the route changes.
// Mount this once in AppShell — it covers all protected pages automatically.

import { useEffect, useRef } from 'react';
import { useLocation }       from 'react-router-dom';
import { trackEvent }        from '../services/activityLogger.js';

/**
 * Derives a human-readable resource_type from a route path.
 * /incidents/abc-123 → 'incidents'
 * /monthly-reports/xyz → 'monthly_reports'
 */
function pathToResourceType(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'app';
  return segment.replace(/-/g, '_');
}

export function usePageView(): void {
  const location    = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip duplicate fires (StrictMode double-mount, etc.)
    if (prevPathRef.current === location.pathname) return;
    prevPathRef.current = location.pathname;

    trackEvent('page_view', {
      page:          location.pathname,
      resource_type: pathToResourceType(location.pathname),
    });
  }, [location.pathname]);
}
