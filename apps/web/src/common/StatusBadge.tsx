// apps/web/src/common/StatusBadge.tsx
// Maps status string values to Bootstrap badge colours.

import React from 'react';

const STATUS_MAP: Record<string, string> = {
  // Lifecycle
  draft:        'secondary',
  open:         'danger',
  new:          'danger',
  running:      'primary',
  in_progress:  'primary',
  investigating: 'warning',
  planned:      'info',
  submitted:    'info',
  validated:    'info',
  requested:    'secondary',
  in_review:    'info',
  notified:     'info',
  contained:    'primary',
  acknowledged: 'info',
  pending:      'warning',
  partial:      'warning',
  mitigated:    'warning',
  resolved:     'success',
  approved:     'success',
  implemented:  'success',
  completed:    'success',
  success:      'success',
  remediated:   'success',
  actioned:     'success',
  published:    'success',
  failed:       'danger',
  rejected:     'danger',
  closed:       'secondary',
  cancelled:    'secondary',
  active:       'danger',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colour = STATUS_MAP[status] ?? 'secondary';
  return (
    <span className={`badge bg-${colour} ${className}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
