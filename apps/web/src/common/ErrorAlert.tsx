// apps/web/src/common/ErrorAlert.tsx

import React from 'react';
import type { ApiError } from '../services/api.js';

interface ErrorAlertProps {
  error:   unknown;
  onRetry?: () => void;
}

export function ErrorAlert({ error, onRetry }: ErrorAlertProps) {
  const message =
    error instanceof Error
      ? error.message
      : 'An unexpected error occurred. Please try again.';

  return (
    <div className="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
      <span>
        <i className="bi bi-exclamation-triangle-fill me-2" />
        {message}
      </span>
      {onRetry && (
        <button className="btn btn-sm btn-outline-danger ms-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
