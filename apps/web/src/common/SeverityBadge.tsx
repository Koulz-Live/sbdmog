// apps/web/src/common/SeverityBadge.tsx
// Maps P1–P4 incident severities and security severity levels to badge classes.

import React from 'react';

const SEVERITY_CLASS: Record<string, string> = {
  P1:       'badge-p1',
  P2:       'badge-p2',
  P3:       'badge-p3',
  P4:       'badge-p4',
  critical: 'badge-p1',
  high:     'badge-p2',
  medium:   'badge-p3',
  low:      'badge-p4',
};

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  const cls = SEVERITY_CLASS[severity] ?? 'bg-secondary';
  return (
    <span className={`badge ${cls} ${className}`}>
      {severity}
    </span>
  );
}
