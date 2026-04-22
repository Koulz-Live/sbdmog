// apps/web/src/common/EmptyState.tsx

import React from 'react';

interface EmptyStateProps {
  icon?:    string;   // Bootstrap icon class, e.g. "bi-inbox"
  title?:   string;
  message?: string;
  action?:  React.ReactNode;
}

export function EmptyState({
  icon    = 'bi-inbox',
  title   = 'The record is clear',
  message = 'Nothing has been recorded here yet.',
  action,
}: EmptyStateProps) {
  return (
    <div className="text-center py-5 text-muted">
      <i className={`bi ${icon} fs-1 mb-3 d-block`} />
      <p className="fw-semibold mb-1">{title}</p>
      {message && <p className="small mb-3">{message}</p>}
      {action}
    </div>
  );
}
