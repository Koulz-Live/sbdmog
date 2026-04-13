// apps/web/src/common/SectionCard.tsx
// Bootstrap card with an optional header and optional action slot.

import React from 'react';

interface SectionCardProps {
  title?:     string;
  subtitle?:  string;
  action?:    React.ReactNode;
  children:   React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
}: SectionCardProps) {
  return (
    <div className={`card shadow-sm ${className}`}>
      {(title || action) && (
        <div className="card-header d-flex align-items-center justify-content-between bg-white py-3">
          <div>
            {title && <h6 className="mb-0 fw-semibold">{title}</h6>}
            {subtitle && <small className="text-muted">{subtitle}</small>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
