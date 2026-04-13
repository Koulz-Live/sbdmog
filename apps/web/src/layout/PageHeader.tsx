// apps/web/src/layout/PageHeader.tsx

import React from 'react';

interface PageHeaderProps {
  title:     string;
  subtitle?: string;
  actions?:  React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-4">
      <div>
        <h4 className="mb-0 fw-bold">{title}</h4>
        {subtitle && <p className="text-muted mb-0 small">{subtitle}</p>}
      </div>
      {actions && <div className="d-flex gap-2">{actions}</div>}
    </div>
  );
}
