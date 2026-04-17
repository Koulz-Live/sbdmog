// apps/web/src/common/StatusBadge.tsx
// Maps status string values to Bootstrap badge colours + Bootstrap Icons.

import React from 'react';

interface StatusMeta {
  colour: string;
  icon:   string;
}

const STATUS_MAP: Record<string, StatusMeta> = {
  // Lifecycle — pending / in-flight
  draft:         { colour: 'secondary', icon: 'bi-pencil'                  },
  open:          { colour: 'danger',    icon: 'bi-exclamation-circle-fill'  },
  new:           { colour: 'danger',    icon: 'bi-exclamation-circle-fill'  },
  running:       { colour: 'primary',   icon: 'bi-arrow-repeat'             },
  in_progress:   { colour: 'primary',   icon: 'bi-arrow-repeat'             },
  investigating: { colour: 'warning',   icon: 'bi-search'                   },
  planned:       { colour: 'info',      icon: 'bi-calendar-event'           },
  submitted:     { colour: 'info',      icon: 'bi-send'                     },
  validated:     { colour: 'info',      icon: 'bi-patch-check'              },
  requested:     { colour: 'secondary', icon: 'bi-question-circle'          },
  in_review:     { colour: 'info',      icon: 'bi-eye'                      },
  notified:      { colour: 'info',      icon: 'bi-bell'                     },
  contained:     { colour: 'primary',   icon: 'bi-shield-check'             },
  acknowledged:  { colour: 'info',      icon: 'bi-hand-thumbs-up'           },
  pending:       { colour: 'warning',   icon: 'bi-hourglass-split'          },
  partial:       { colour: 'warning',   icon: 'bi-pie-chart'                },
  mitigated:     { colour: 'warning',   icon: 'bi-shield-half'              },
  // Terminal — success
  resolved:      { colour: 'success',   icon: 'bi-check-circle-fill'        },
  approved:      { colour: 'success',   icon: 'bi-check-circle-fill'        },
  implemented:   { colour: 'success',   icon: 'bi-check-circle-fill'        },
  completed:     { colour: 'success',   icon: 'bi-check-circle-fill'        },
  success:       { colour: 'success',   icon: 'bi-check-circle-fill'        },
  remediated:    { colour: 'success',   icon: 'bi-bandaid'                  },
  actioned:      { colour: 'success',   icon: 'bi-check2-all'               },
  published:     { colour: 'success',   icon: 'bi-broadcast'                },
  // Terminal — failure / closed
  failed:        { colour: 'danger',    icon: 'bi-x-circle-fill'            },
  rejected:      { colour: 'danger',    icon: 'bi-x-circle-fill'            },
  closed:        { colour: 'secondary', icon: 'bi-slash-circle'             },
  cancelled:     { colour: 'secondary', icon: 'bi-slash-circle'             },
  active:        { colour: 'danger',    icon: 'bi-record-circle-fill'       },
};

const FALLBACK: StatusMeta = { colour: 'secondary', icon: 'bi-circle' };

interface StatusBadgeProps {
  status:     string;
  className?: string;
  showIcon?:  boolean;
}

export function StatusBadge({ status, className = '', showIcon = true }: StatusBadgeProps) {
  const { colour, icon } = STATUS_MAP[status] ?? FALLBACK;
  return (
    <span className={`badge bg-${colour} d-inline-flex align-items-center gap-1 ${className}`}>
      {showIcon && <i className={`bi ${icon}`} style={{ fontSize: '0.7rem' }} />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}
