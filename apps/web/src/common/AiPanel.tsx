// apps/web/src/common/AiPanel.tsx
// Reusable AI output panel — shows a generate button, spinner during generation,
// and formatted markdown-style output with an "Advisory only" disclaimer.
// All icons use Bootstrap Icons (bi bi-*).

import React from 'react';

interface AiPanelProps {
  title:      string;
  content?:   string | null;
  isPending:  boolean;
  onGenerate: () => void;
  disclaimer?: string;
  model?:     string;
  buttonLabel?: string;
}

export function AiPanel({
  title,
  content,
  isPending,
  onGenerate,
  disclaimer = 'AI-generated advisory only. Review before acting.',
  model,
  buttonLabel = 'Generate AI Analysis',
}: AiPanelProps) {
  return (
    <div className="card shadow-sm border-0 mt-3">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-primary-subtle text-primary fw-semibold px-2 py-1 d-inline-flex align-items-center gap-1" style={{ fontSize: '0.7rem' }}>
            <i className="bi bi-stars" style={{ fontSize: '0.75rem' }} />
            AI
          </span>
          <h6 className="mb-0 fw-semibold">{title}</h6>
        </div>
        <button
          className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
          onClick={onGenerate}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              Generating…
            </>
          ) : (
            <>
              <i className="bi bi-stars" />
              {buttonLabel}
            </>
          )}
        </button>
      </div>

      {content ? (
        <div className="card-body">
          <pre
            className="mb-0"
            style={{
              whiteSpace:  'pre-wrap',
              fontFamily:  'inherit',
              fontSize:    '0.875rem',
              lineHeight:  '1.65',
              color:       '#212529',
            }}
          >
            {content}
          </pre>
          <div className="d-flex align-items-center justify-content-between mt-3 pt-2 border-top">
            <small className="text-warning fw-semibold d-inline-flex align-items-center gap-1">
              <i className="bi bi-exclamation-triangle-fill" />
              {disclaimer}
            </small>
            {model && (
              <small className="text-muted font-monospace">{model}</small>
            )}
          </div>
        </div>
      ) : (
        !isPending && (
          <div className="card-body text-center py-4 text-muted">
            <i className="bi bi-cpu d-block fs-2 mb-2 opacity-25" />
            <small>No AI analysis generated yet. Click the button above to generate one.</small>
          </div>
        )
      )}
    </div>
  );
}
