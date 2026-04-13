// apps/web/src/common/LoadingSpinner.tsx

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md';
}

export function LoadingSpinner({ message = 'Loading…', size = 'md' }: LoadingSpinnerProps) {
  const spinnerClass = size === 'sm' ? 'spinner-border-sm' : '';
  return (
    <div className="d-flex align-items-center justify-content-center py-5">
      <div className={`spinner-border text-primary ${spinnerClass}`} role="status">
        <span className="visually-hidden">{message}</span>
      </div>
      {size !== 'sm' && <span className="ms-3 text-muted">{message}</span>}
    </div>
  );
}
