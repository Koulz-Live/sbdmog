// apps/web/src/pages/GovernanceInsights.tsx
// AI-powered governance insights page.
// Aggregates live Supabase data server-side and produces an executive
// governance briefing via GPT-4o.

import React, { useState } from 'react';
import { SectionCard }         from '../common/SectionCard.js';
import { AiPanel }             from '../common/AiPanel.js';
import { useGovernanceInsights } from '../hooks/useGovernanceInsights.js';

interface InsightResult {
  output:       string;
  model:        string;
  tokens:       { prompt: number; completion: number };
  generated_at: string;
}

export function GovernanceInsights() {
  const mutation = useGovernanceInsights();
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    mutation.mutate(undefined, {
      onSuccess: (res) => {
        // unwrap nested data
        const payload = (res as { data: InsightResult }).data ?? res;
        setResult(payload as InsightResult);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Generation failed.');
      },
    });
  }

  return (
    <div>
      {/* Page header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h4 className="mb-0 fw-bold">Governance Insights</h4>
          <small className="text-muted">
            AI-powered executive briefing synthesised from live HEQCIS operational data
          </small>
        </div>
        <span className="badge bg-primary-subtle text-primary px-3 py-2 fw-semibold">
          ✦ Powered by GPT-4o
        </span>
      </div>

      {/* What this does */}
      <SectionCard title="About this report" className="mb-4">
        <p className="mb-2 text-muted" style={{ fontSize: '0.9rem' }}>
          When you click <strong>Generate</strong>, the system will:
        </p>
        <ol className="mb-0 text-muted" style={{ fontSize: '0.9rem' }}>
          <li>Aggregate live data from Incidents, Security Findings, POPIA Events, Submission Readiness, Change Requests, and Backup Runs.</li>
          <li>Send the aggregated data to GPT-4o with a CHE governance advisor prompt.</li>
          <li>Return a structured 5-section briefing: Executive Summary, Key Risks, POPIA &amp; Compliance, Recommended Actions, and Trend Outlook.</li>
        </ol>
      </SectionCard>

      {/* Error */}
      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Panel */}
      <AiPanel
        title="Executive Governance Briefing"
        content={result?.output}
        isPending={mutation.isPending}
        onGenerate={handleGenerate}
        model={result?.model}
        buttonLabel="Generate Governance Insights"
        disclaimer="AI-generated advisory for CHE leadership. Verify all figures against source systems before acting."
      />

      {/* Token / metadata footer */}
      {result && (
        <div className="d-flex gap-4 mt-3 text-muted" style={{ fontSize: '0.78rem' }}>
          <span>
            <strong>Generated:</strong>{' '}
            {new Date(result.generated_at).toLocaleString('en-ZA')}
          </span>
          <span>
            <strong>Prompt tokens:</strong> {result.tokens.prompt.toLocaleString()}
          </span>
          <span>
            <strong>Completion tokens:</strong> {result.tokens.completion.toLocaleString()}
          </span>
          <span>
            <strong>Model:</strong>{' '}
            <span className="font-monospace">{result.model}</span>
          </span>
        </div>
      )}
    </div>
  );
}
