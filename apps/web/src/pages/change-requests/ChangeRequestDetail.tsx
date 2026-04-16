// apps/web/src/pages/change-requests/ChangeRequestDetail.tsx

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../layout/PageHeader.js';
import { StatusBadge } from '../../common/StatusBadge.js';
import { SectionCard } from '../../common/SectionCard.js';
import { AiPanel } from '../../common/AiPanel.js';
import { LoadingSpinner } from '../../common/LoadingSpinner.js';
import { ErrorAlert } from '../../common/ErrorAlert.js';
import { useChangeRequest, useApproveChangeRequest, useGenerateCrAiRisk } from '../../hooks/useChangeRequests.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { ChangeRequestApproval } from '@heqcis/types';

function riskBadge(level?: string | null) {
  const map: Record<string, string> = {
    low: 'success', medium: 'warning', high: 'danger', critical: 'danger',
  };
  const cls = map[level?.toLowerCase() ?? ''] ?? 'secondary';
  return <span className={`badge bg-${cls}`}>{level ?? '—'}</span>;
}

function decisionBadge(decision: string) {
  return (
    <span className={`badge bg-${decision === 'approved' ? 'success' : 'danger'}`}>
      {decision}
    </span>
  );
}

export function ChangeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const { data, isLoading, error, refetch } = useChangeRequest(id!);
  const approveMutation = useApproveChangeRequest(id!);
  const aiRiskMutation  = useGenerateCrAiRisk(id!);

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [decision, setDecision]   = useState<'approved' | 'rejected'>('approved');
  const [comments, setComments]   = useState('');
  const [approvalError, setApprovalError] = useState('');

  const cr        = data?.data;
  const approvals = (cr as any)?.change_request_approvals as ChangeRequestApproval[] ?? [];
  const aiContent = cr?.ai_risk_assessment ?? null;

  async function handleApproval() {
    setApprovalError('');
    try {
      await approveMutation.mutateAsync({ decision, comments });
      setShowApprovalModal(false);
      setComments('');
    } catch (e: any) {
      setApprovalError(e?.message ?? 'Approval failed');
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorAlert error={error} onRetry={refetch} />;
  if (!cr)       return null;

  const canApprove = isAdmin && ['submitted', 'under_review'].includes(cr.status);

  return (
    <div>
      <PageHeader
        title={`${cr.reference} — ${cr.title}`}
        subtitle={`Status: ${cr.status}  ·  Risk: ${cr.risk_level ?? 'unknown'}  ·  Type: ${cr.type}`}
        actions={
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate('/change-requests')}>
              <i className="bi bi-arrow-left me-1" />Back
            </button>
            {canApprove && (
              <button className="btn btn-sm btn-primary" onClick={() => setShowApprovalModal(true)}>
                <i className="bi bi-check2-circle me-1" />Approve / Reject
              </button>
            )}
          </div>
        }
      />

      <div className="d-flex gap-2 mb-4">
        <StatusBadge status={cr.status} />
        {riskBadge(cr.risk_level)}
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <SectionCard title="Change Details">
            <dl className="row mb-0">
              <dt className="col-sm-4 text-muted">Reference</dt>
              <dd className="col-sm-8">{cr.reference}</dd>
              <dt className="col-sm-4 text-muted">Type</dt>
              <dd className="col-sm-8">{cr.type}</dd>
              <dt className="col-sm-4 text-muted">Risk Level</dt>
              <dd className="col-sm-8">{riskBadge(cr.risk_level)}</dd>
              <dt className="col-sm-4 text-muted">Scheduled Date</dt>
              <dd className="col-sm-8">
                {cr.scheduled_date ? new Date(cr.scheduled_date).toLocaleDateString('en-ZA') : '—'}
              </dd>
              <dt className="col-sm-4 text-muted">Implemented</dt>
              <dd className="col-sm-8">
                {cr.implemented_at ? new Date(cr.implemented_at).toLocaleDateString('en-ZA') : '—'}
              </dd>
              <dt className="col-sm-4 text-muted">Requested By</dt>
              <dd className="col-sm-8">{cr.requested_by ?? '—'}</dd>
            </dl>
          </SectionCard>

          {cr.description && (
            <SectionCard title="Description" className="mt-3">
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{cr.description}</p>
            </SectionCard>
          )}

          {cr.rollback_plan && (
            <SectionCard title="Rollback Plan" className="mt-3">
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{cr.rollback_plan}</p>
            </SectionCard>
          )}

          {cr.testing_notes && (
            <SectionCard title="Testing Notes" className="mt-3">
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>{cr.testing_notes}</p>
            </SectionCard>
          )}
        </div>

        <div className="col-lg-4">
          <SectionCard title="Approval History">
            {approvals.length === 0 ? (
              <p className="text-muted mb-0 small">No approvals recorded yet.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {approvals.map((a) => (
                  <li key={a.id} className="border-bottom pb-2 mb-2">
                    <div className="d-flex justify-content-between align-items-center">
                      {decisionBadge(a.decision)}
                      <small className="text-muted">
                        {a.decided_at ? new Date(a.decided_at).toLocaleDateString('en-ZA') : '—'}
                      </small>
                    </div>
                    {a.comments && (
                      <p className="mb-0 mt-1 small text-secondary" style={{ whiteSpace: 'pre-wrap' }}>
                        {a.comments}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="mt-3">
            <AiPanel
              title="AI Risk Assessment"
              content={aiContent}
              isPending={aiRiskMutation.isPending}
              onGenerate={() => aiRiskMutation.mutate()}
              buttonLabel="Generate Risk Assessment"
              disclaimer="AI-generated risk analysis. Review with your change advisory board before acting."
            />
          </div>
        </div>
      </div>

      {showApprovalModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Approve / Reject Change Request</h5>
                <button className="btn-close" onClick={() => setShowApprovalModal(false)} />
              </div>
              <div className="modal-body">
                {approvalError && (
                  <div className="alert alert-danger py-2">{approvalError}</div>
                )}
                <div className="mb-3">
                  <label className="form-label fw-semibold">Decision</label>
                  <div className="d-flex gap-3">
                    <div className="form-check">
                      <input className="form-check-input" type="radio" id="dec-approve"
                        checked={decision === 'approved'} onChange={() => setDecision('approved')} />
                      <label className="form-check-label text-success fw-semibold" htmlFor="dec-approve">Approve</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="radio" id="dec-reject"
                        checked={decision === 'rejected'} onChange={() => setDecision('rejected')} />
                      <label className="form-check-label text-danger fw-semibold" htmlFor="dec-reject">Reject</label>
                    </div>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Comments</label>
                  <textarea className="form-control" rows={4} value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Provide rationale for your decision…" />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowApprovalModal(false)}>Cancel</button>
                <button
                  className={`btn btn-${decision === 'approved' ? 'success' : 'danger'}`}
                  onClick={handleApproval}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending
                    ? <><span className="spinner-border spinner-border-sm me-1" />Processing…</>
                    : decision === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
