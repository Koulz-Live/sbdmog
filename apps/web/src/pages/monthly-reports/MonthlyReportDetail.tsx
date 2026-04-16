// apps/web/src/pages/monthly-reports/MonthlyReportDetail.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../layout/PageHeader.js';
import { StatusBadge } from '../../common/StatusBadge.js';
import { SectionCard } from '../../common/SectionCard.js';
import { AiPanel } from '../../common/AiPanel.js';
import { LoadingSpinner } from '../../common/LoadingSpinner.js';
import { ErrorAlert } from '../../common/ErrorAlert.js';
import {
  useMonthlyReport,
  useUpdateMonthlyReport,
  useApproveMonthlyReport,
  usePublishMonthlyReport,
  useGenerateMonthlyReportDraft,
} from '../../hooks/useMonthlyReports.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { MonthlyReport } from '@heqcis/types';

type SectionKey =
  | 'section_executive_summary'
  | 'section_incidents'
  | 'section_backup_etl'
  | 'section_change_requests'
  | 'section_security_popia'
  | 'section_submission_readiness'
  | 'section_upcoming_work';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'section_executive_summary',   label: 'Executive Summary' },
  { key: 'section_incidents',           label: 'Incidents' },
  { key: 'section_backup_etl',          label: 'Backup & ETL' },
  { key: 'section_change_requests',     label: 'Change Requests' },
  { key: 'section_security_popia',      label: 'Security & POPIA' },
  { key: 'section_submission_readiness',label: 'Submission Readiness' },
  { key: 'section_upcoming_work',       label: 'Upcoming Work' },
];

function formatPeriod(period: string) {
  const [year, month] = period.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

export function MonthlyReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const { data, isLoading, error, refetch } = useMonthlyReport(id!);
  const updateMutation  = useUpdateMonthlyReport(id!);
  const approveMutation = useApproveMonthlyReport(id!);
  const publishMutation = usePublishMonthlyReport(id!);
  const aiDraftMutation = useGenerateMonthlyReportDraft(id!);

  const [sections, setSections] = useState<Record<SectionKey, string>>({
    section_executive_summary:    '',
    section_incidents:            '',
    section_backup_etl:           '',
    section_change_requests:      '',
    section_security_popia:       '',
    section_submission_readiness: '',
    section_upcoming_work:        '',
  });
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [actionError, setActionError] = useState('');

  const report = data?.data;

  useEffect(() => {
    if (!report) return;
    setSections({
      section_executive_summary:    report.section_executive_summary    ?? '',
      section_incidents:            report.section_incidents            ?? '',
      section_backup_etl:           report.section_backup_etl           ?? '',
      section_change_requests:      report.section_change_requests      ?? '',
      section_security_popia:       report.section_security_popia       ?? '',
      section_submission_readiness: report.section_submission_readiness ?? '',
      section_upcoming_work:        report.section_upcoming_work        ?? '',
    });
    setDirty(false);
  }, [report?.id]);

  function handleSectionChange(key: SectionKey, value: string) {
    setSections((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaveError('');
    try {
      await updateMutation.mutateAsync(sections as any);
      setDirty(false);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Save failed');
    }
  }

  async function handleAction(action: 'approve' | 'publish') {
    setActionError('');
    try {
      if (action === 'approve') await approveMutation.mutateAsync();
      else                      await publishMutation.mutateAsync();
    } catch (e: any) {
      setActionError(e?.message ?? `${action} failed`);
    }
  }

  // Merge AI draft output into sections
  const aiContent = (aiDraftMutation.data as any)?.data?.output ?? null;
  useEffect(() => {
    if (!aiContent) return;
    // The AI draft is stored in sections via refetch after mutation invalidates
  }, [aiContent]);

  if (isLoading) return <LoadingSpinner />;
  if (error)     return <ErrorAlert error={error} onRetry={refetch} />;
  if (!report)   return null;

  const isDraft     = report.status === 'draft';
  const isApproved  = report.status === 'approved';

  return (
    <div>
      <PageHeader
        title={`Monthly Report — ${formatPeriod(report.period)}`}
        subtitle={`Status: ${report.status}  ·  Prepared by: ${report.prepared_by ?? '—'}`}
        actions={
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate('/monthly-reports')}>
              <i className="bi bi-arrow-left me-1" />Back
            </button>
            {dirty && (
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending
                  ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</>
                  : <><i className="bi bi-floppy me-1" />Save Sections</>}
              </button>
            )}
            {isAdmin && isDraft && (
              <button className="btn btn-sm btn-success" onClick={() => handleAction('approve')} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? <><span className="spinner-border spinner-border-sm me-1" />Approving…</> : 'Approve'}
              </button>
            )}
            {isAdmin && isApproved && (
              <button className="btn btn-sm btn-warning" onClick={() => handleAction('publish')} disabled={publishMutation.isPending}>
                {publishMutation.isPending ? <><span className="spinner-border spinner-border-sm me-1" />Publishing…</> : 'Publish'}
              </button>
            )}
          </div>
        }
      />

      <div className="d-flex gap-2 mb-4">
        <StatusBadge status={report.status} />
        {report.approved_at && (
          <span className="text-muted small">
            Approved: {new Date(report.approved_at).toLocaleDateString('en-ZA')}
          </span>
        )}
        {report.published_at && (
          <span className="text-muted small">
            Published: {new Date(report.published_at).toLocaleDateString('en-ZA')}
          </span>
        )}
      </div>

      {saveError   && <div className="alert alert-danger py-2 mb-3">{saveError}</div>}
      {actionError && <div className="alert alert-danger py-2 mb-3">{actionError}</div>}

      <div className="row g-3">
        <div className="col-lg-8">
          {SECTIONS.map(({ key, label }) => (
            <SectionCard key={key} title={label} className="mb-3">
              <textarea
                className="form-control border-0 p-0"
                rows={6}
                value={sections[key]}
                onChange={(e) => handleSectionChange(key, e.target.value)}
                placeholder={`Enter ${label} content…`}
                style={{ resize: 'vertical', background: 'transparent' }}
              />
            </SectionCard>
          ))}
        </div>

        <div className="col-lg-4">
          <SectionCard title="Report Info">
            <dl className="row mb-0 small">
              <dt className="col-6 text-muted">Period</dt>
              <dd className="col-6">{formatPeriod(report.period)}</dd>
              <dt className="col-6 text-muted">Prepared By</dt>
              <dd className="col-6">{report.prepared_by ?? '—'}</dd>
              <dt className="col-6 text-muted">Approved By</dt>
              <dd className="col-6">{report.approved_by ?? '—'}</dd>
              <dt className="col-6 text-muted">Status</dt>
              <dd className="col-6"><StatusBadge status={report.status} /></dd>
            </dl>
          </SectionCard>

          <div className="mt-3">
            <AiPanel
              title="AI Report Draft"
              content={null}
              isPending={aiDraftMutation.isPending}
              onGenerate={() => aiDraftMutation.mutate()}
              buttonLabel="Generate AI Draft"
              disclaimer="AI-generated draft content. Review and edit all sections before approving."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
