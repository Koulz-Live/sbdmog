// apps/web/src/common/SeverityBadge.tsx
// Maps P1–P4 incident severities and security severity levels to badge classes + Bootstrap Icons.

import React from 'react';

interface SeverityMeta {
  cls:  string;
  icon: string;
}

const SEVERITY_MAP: Record<string, SeverityMeta> = {
  P1:       { cls: 'badge-p1', icon: 'bi-fire'                      },
  critical: { cls: 'badge-p1', icon: 'bi-fire'                      },
  P2:       { cls: 'badge-p2', icon: 'bi-exclamation-triangle-fill'  },
  high:     { cls: 'badge-p2', icon: 'bi-exclamation-triangle-fill'  },
  P3:       { cls: 'badge-p3', icon: 'bi-exclamation-circle'         },
  medium:   { cls: 'badge-p3', icon: 'bi-exclamation-circle'         },
  P4:       { cls: 'badge-p4', icon: 'bi-info-circle'                },
  low:      { cls: 'badge-p4', icon: 'bi-info-circle'                },
};

const FALLBACK: SeverityMeta = { cls: 'bg-secondary', icon: 'bi-circle' };

interface SeverityBadgeProps {
  severity:   string;
  className?: string;
  showIcon?:  boolean;
}

export function SeverityBadge({ severity, className = '', showIcon = true }: SeverityBadgeProps) {
  const { cls, icon } = SEVERITY_MAP[severity] ?? FALLBACK;
  return (
    <span className={`badge ${cls} d-inline-flex align-items-center gap-1 ${className}`}>
      {showIcon && <i className={`bi ${icon}`} style={{ fontSize: '0.7rem' }} />}
      {severity}
    </span>
  );
}
