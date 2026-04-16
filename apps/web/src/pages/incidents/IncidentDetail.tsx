// apps/web/src/pages/incidents/IncidentDetail.tsx

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useIncident,
  useIncidentUpdates,
  useAddIncidentUpdate,
  useGenerateAiSummary,
  useGenerateRca,
} from '../../hooks/useIncidents.js';
import { StatusBadge } from '../../common/StatusBadge.js';
import { SeverityBadge } from '../../common/SeverityBadge.js';
import { LoadingSpinner } from '../../common/LoadingSpinner.js';
import { ErrorAlert } from '../../common/ErrorAlert.js';
import { SectionCard } from '../../common/SectionCard.js';
import { PageHeader } from '../../layout/PageHeader.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useState } from 'react';

export function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isEngineer, user } = useAuth();

  const [updateText, setUpdateText] = useState('');

  const { data: incident, isLoading, error, refetch } = useIncident(id ?? '');
  const { data: updatesResult } = useIncidentUpdates(id ?? '');
  const updates = updatesResult?.data ?? [];

  const addUpdate      = useAddIncidentUpdate(id ?? '');
  const genSummary     = useGenerateAiSummary(id ?? '');
  const genRca         = useGenerateRca(id ?? '');

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorAlert error={error} onRetry={refetch} />;
  if (!incident) return null;

  const handleAddUpdate = async () => {
    if (!updateText.trim()) return;
    await addUpdate.mutateAsync({ content: updateText.trim() });
    setUpdateText('');
  };

  return (
    <div>
      <PageHeader
        title={incident.reference}
        subtitle={incident.title}
        actions={
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate(-1)}>
            <i className="bi bi-arrow-left me-1" />
            Back
          </button>
        }
      />

      {/* Meta row */}
      <div className="d-flex flex-wrap gap-3 mb-4">
        <StatusBadge   status={incident.status}   />
        <SeverityBadge severity={incident.severity} />
        <span className="badge bg-light text-dark border">{incident.category}</span>
        <span className="badge bg-light text-dark border">{incident.affected_system}</span>
        <span className="text-muted small">
          Occurred: {new Date(incident.created_at).toLocaleString('en-ZA')}
        </span>
        {incident.resolved_at && (
          <span className="text-muted small">
            Resolved: {new Date(incident.resolved_at).toLocaleString('en-ZA')}
          </span>
        )}
      </div>

      <div className="row g-4">
        {/* Description */}
        <div className="col-lg-8">
          <SectionCard title="Description">
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {incident.description ?? '—'}
            </p>
          </SectionCard>
        </div>

        {/* AI Actions */}
        <div className="col-lg-4">
          <SectionCard title="AI Advisory" subtitle="GPT-4o — advisory only, no data mutations">
            <div className="d-grid gap-2">
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => genSummary.mutate()}
                disabled={genSummary.isPending}
              >
                {genSummary.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />Generating…</>
                  : <><i className="bi bi-stars me-1" />Generate Summary</>
                }
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => genRca.mutate()}
                disabled={genRca.isPending}
              >
                {genRca.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />Generating…</>
                  : <><i className="bi bi-file-earmark-text me-1" />Draft RCA</>
                }
              </button>
            </div>
          </SectionCard>
        </div>

        {/* AI Summary */}
        {incident.ai_summary && (
          <div className="col-12">
            <SectionCard title="AI Summary" subtitle="Advisory — not authoritative">
              <p className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>
                {incident.ai_summary}
              </p>
            </SectionCard>
          </div>
        )}

        {/* AI RCA Draft */}
        {incident.ai_rca_draft && (
          <div className="col-12">
            <SectionCard title="AI RCA Draft" subtitle="Advisory — review before publishing">
              <p className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>
                {incident.ai_rca_draft}
              </p>
            </SectionCard>
          </div>
        )}

        {/* Updates */}
        <div className="col-12">
          <SectionCard
            title="Incident Updates"
            action={
              isEngineer ? (
                <button
                  className="btn btn-sm btn-primary"
                  data-bs-toggle="collapse"
                  data-bs-target="#addUpdateForm"
                >
                  <i className="bi bi-plus-lg me-1" />
                  Add Update
                </button>
              ) : undefined
            }
          >
            {/* Add update form */}
            {isEngineer && (
              <div className="collapse mb-3" id="addUpdateForm">
                <textarea
                  className="form-control mb-2"
                  rows={3}
                  placeholder="Describe the update…"
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleAddUpdate}
                  disabled={addUpdate.isPending || !updateText.trim()}
                >
                  {addUpdate.isPending ? 'Saving…' : 'Save Update'}
                </button>
              </div>
            )}

            {/* Timeline */}
            {updates.length === 0 ? (
              <p className="text-muted mb-0 small">No updates logged yet.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {[...updates].reverse().map((u) => (
                  <li key={u.id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between mb-1">
                      <span className="fw-semibold small">{u.author_id ?? '—'}</span>
                      <span className="text-muted small">
                        {new Date(u.created_at).toLocaleString('en-ZA')}
                      </span>
                    </div>
                    <p className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>
                      {u.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
