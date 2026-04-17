// apps/web/src/common/LoadingSpinner.tsx
// Bootstrap 5 spinner with optional message. Uses Bootstrap Icons for inline variant.

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md';
  inline?: boolean;
}

export function LoadingSpinner({ message = 'Loading…', size = 'md', inline = false }: LoadingSpinnerProps) {
  const spinnerClass = size === 'sm' ? 'spinner-border-sm' : '';

  if (inline) {
    return (
      <span className="d-inline-flex align-items-center gap-2 text-muted small">
        <span className={`spinner-border spinner-border-sm text-primary ${spinnerClass}`} role="status" aria-hidden="true" />
        {message}
      </span>
    );
  }

  return (
    <div className="d-flex align-items-center justify-content-center py-5 gap-3">
      <div className={`spinner-border text-primary ${spinnerClass}`} role="status">
        <span className="visually-hidden">{message}</span>
      </div>
      {size !== 'sm' && <span className="text-muted">{message}</span>}
    </div>
  );
}
