// apps/web/src/common/AiPanel.tsx
// Reusable AI output panel — shows a generate button, spinner during generation,
// and formatted markdown-style output with an "Advisory only" disclaimer.

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
          <span className="badge bg-primary-subtle text-primary fw-semibold px-2 py-1" style={{ fontSize: '0.7rem' }}>
            ✦ AI
          </span>
          <h6 className="mb-0 fw-semibold">{title}</h6>
        </div>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={onGenerate}
          disabled={isPending}
        >
          {isPending ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
              Generating…
            </>
          ) : (
            buttonLabel
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
            <small className="text-warning fw-semibold">
              ⚠ {disclaimer}
            </small>
            {model && (
              <small className="text-muted font-monospace">{model}</small>
            )}
          </div>
        </div>
      ) : (
        !isPending && (
          <div className="card-body text-center py-4 text-muted">
            <small>No AI analysis generated yet. Click the button above to generate one.</small>
          </div>
        )
      )}
    </div>
  );
}
