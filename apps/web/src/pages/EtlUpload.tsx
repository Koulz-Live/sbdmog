// apps/web/src/pages/EtlUpload.tsx
// CSV → Supabase → Azure SQL ETL Upload page.
// 1. User selects a dataset type (defines expected CSV headers)
// 2. Uploads a CSV file — parsed client-side by PapaParse
// 3. Headers are validated against the expected schema
// 4. Preview table shows the parsed rows
// 5. "Save to Supabase" → POST /api/etl-upload → inserts rows + creates etl_run
// 6. "Load to Azure SQL" → POST /api/etl-upload/push-azure → Azure SQL insert + etl_run

import React, { useRef, useState, useCallback } from 'react';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import { PageHeader }   from '../layout/PageHeader.js';
import { SectionCard }  from '../common/SectionCard.js';
import { apiPost }      from '../services/api.js';

// ── Dataset definitions ───────────────────────────────────────────────────────

interface DatasetDef {
  label:        string;
  job_name:     string;
  description:  string;
  requiredCols: string[];
  optionalCols: string[];
  icon:         string;
}

const DATASETS: DatasetDef[] = [
  {
    label:        'Incidents',
    job_name:     'incidents',
    description:  'IT incidents and outage records.',
    requiredCols: ['title', 'severity', 'category'],
    optionalCols: ['affected_system', 'assigned_to', 'description', 'status'],
    icon:         'bi-exclamation-triangle',
  },
  {
    label:        'Backup Runs',
    job_name:     'backup_runs',
    description:  'Database backup job history.',
    requiredCols: ['job_name', 'status', 'started_at'],
    optionalCols: ['server_name', 'database_name', 'finished_at', 'size_gb'],
    icon:         'bi-cloud-upload',
  },
  {
    label:        'Maintenance Activities',
    job_name:     'maintenance_activities',
    description:  'Scheduled and completed maintenance windows.',
    requiredCols: ['title', 'system_name', 'maintenance_type', 'scheduled_start'],
    optionalCols: ['scheduled_end', 'assigned_to', 'notes', 'status'],
    icon:         'bi-tools',
  },
  {
    label:        'Security Findings',
    job_name:     'security_findings',
    description:  'Vulnerability and security audit findings.',
    requiredCols: ['title', 'severity', 'category'],
    optionalCols: ['affected_system', 'discovered_at', 'remediation_notes', 'status'],
    icon:         'bi-shield-exclamation',
  },
  {
    label:        'POPIA Events',
    job_name:     'popia_events',
    description:  'Data protection and POPIA compliance events.',
    requiredCols: ['event_type', 'description'],
    optionalCols: ['data_subject_count', 'reported_at', 'outcome'],
    icon:         'bi-person-lock',
  },
  {
    label:        'Change Requests',
    job_name:     'change_requests',
    description:  'IT change management requests.',
    requiredCols: ['title', 'change_type'],
    optionalCols: ['requested_by', 'target_date', 'justification', 'risk_level', 'status'],
    icon:         'bi-arrow-left-right',
  },
  {
    label:        'Handover Items',
    job_name:     'handover_items',
    description:  'Operational handover and task items.',
    requiredCols: ['title', 'category', 'priority'],
    optionalCols: ['assigned_to', 'due_date', 'notes', 'status'],
    icon:         'bi-box-arrow-in-right',
  },
  {
    label:        'Submission Readiness',
    job_name:     'submission_readiness',
    description:  'HEQCIS dataset submission readiness checks.',
    requiredCols: ['dataset_name', 'period', 'status'],
    optionalCols: ['notes'],
    icon:         'bi-check2-circle',
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedFile {
  headers: string[];
  rows:    Record<string, string>[];
  errors:  string[];
}

interface UploadResult {
  etl_run_id:    string;
  rows_inserted: number;
  rows_failed:   number;
  status:        string;
  errors:        string[];
}

type Stage = 'select' | 'preview' | 'saved' | 'pushed';

// ── Main component ────────────────────────────────────────────────────────────

export function EtlUpload() {
  const navigate = useNavigate();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [selectedJob, setSelectedJob]     = useState<DatasetDef | null>(null);
  const [parsed,      setParsed]          = useState<ParsedFile | null>(null);
  const [stage,       setStage]           = useState<Stage>('select');
  const [isDragging,  setIsDragging]      = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Results
  const [saveResult, setSaveResult]   = useState<UploadResult | null>(null);
  const [pushResult, setPushResult]   = useState<UploadResult | null>(null);

  // Loading states
  const [saving,  setSaving]  = useState(false);
  const [pushing, setPushing] = useState(false);

  // Error alerts
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // ── Parse a File object ──────────────────────────────────────────────────

  const parseFile = useCallback((file: File, dataset: DatasetDef) => {
    Papa.parse<Record<string, string>>(file, {
      header:           true,
      skipEmptyLines:   true,
      transformHeader:  (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (result) => {
        const headers = result.meta.fields ?? [];
        const rows    = result.data;
        const parseErrors = result.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`);

        // Validate required columns
        const missing = dataset.requiredCols.filter((c) => !headers.includes(c));
        const valErrs: string[] = [];
        if (missing.length > 0) {
          valErrs.push(`Missing required columns: ${missing.join(', ')}`);
        }

        const allowed = [...dataset.requiredCols, ...dataset.optionalCols];
        const unknown = headers.filter((h) => !allowed.includes(h));
        if (unknown.length > 0) {
          valErrs.push(`Unknown columns (will be ignored): ${unknown.join(', ')}`);
        }

        setValidationErrors([...valErrs, ...parseErrors.slice(0, 5)]);
        setParsed({ headers, rows, errors: parseErrors });
        setStage('preview');
        setSaveResult(null);
        setPushResult(null);
        setSaveError(null);
        setPushError(null);
      },
      error: (err) => {
        setValidationErrors([`Parse error: ${err.message}`]);
      },
    });
  }, []);

  // ── Handle file input ──────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;
    parseFile(file, selectedJob);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !selectedJob) return;
    if (!file.name.endsWith('.csv')) {
      setValidationErrors(['Only .csv files are accepted.']);
      return;
    }
    parseFile(file, selectedJob);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = () => {
    setParsed(null);
    setStage('select');
    setValidationErrors([]);
    setSaveResult(null);
    setPushResult(null);
    setSaveError(null);
    setPushError(null);
  };

  // ── Save to Supabase ──────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!parsed || !selectedJob) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await apiPost<UploadResult>('/etl-upload', {
        job_name: selectedJob.job_name,
        rows:     parsed.rows,
      });
      setSaveResult(result);
      setStage('saved');
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── Push to Azure SQL ─────────────────────────────────────────────────────

  const handlePushAzure = async () => {
    if (!parsed || !selectedJob) return;
    setPushing(true);
    setPushError(null);
    try {
      const result = await apiPost<UploadResult>('/etl-upload/push-azure', {
        job_name: selectedJob.job_name,
        rows:     parsed.rows,
      });
      setPushResult(result);
      setStage('pushed');
    } catch (err) {
      setPushError((err as Error).message);
    } finally {
      setPushing(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const hasCriticalErrors = validationErrors.some((e) =>
    e.startsWith('Missing required'),
  );

  const allCols = selectedJob
    ? [...selectedJob.requiredCols, ...selectedJob.optionalCols]
    : [];

  const previewCols = parsed?.headers.filter((h) => allCols.includes(h)) ?? [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="ETL Upload"
        subtitle="Upload a CSV file, validate headers, save to Supabase, and push to Azure SQL."
      />

      {/* ── Step indicator ─────────────────────────────────────── */}
      <div className="d-flex align-items-center gap-2 mb-4 flex-wrap">
        {[
          { key: 'select',  label: '1  Select dataset', icon: 'bi-list-ul' },
          { key: 'preview', label: '2  Preview & validate', icon: 'bi-table' },
          { key: 'saved',   label: '3  Saved to Supabase', icon: 'bi-database-check' },
          { key: 'pushed',  label: '4  Pushed to Azure SQL', icon: 'bi-cloud-check' },
        ].map((step, i, arr) => {
          const stages: Stage[] = ['select', 'preview', 'saved', 'pushed'];
          const stepIdx  = stages.indexOf(step.key as Stage);
          const currIdx  = stages.indexOf(stage);
          const done     = stepIdx < currIdx;
          const active   = stepIdx === currIdx;

          return (
            <React.Fragment key={step.key}>
              <span
                className={`badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-2 ${
                  done   ? 'bg-success'
                  : active ? 'bg-primary'
                  : 'bg-light text-muted border'
                }`}
                style={{ fontSize: '0.78rem' }}
              >
                <i className={`bi ${done ? 'bi-check-circle-fill' : step.icon}`} />
                {step.label}
              </span>
              {i < arr.length - 1 && (
                <i className="bi bi-chevron-right text-muted small" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="row g-4">
        {/* ── Left column: Dataset selector + upload ──────────── */}
        <div className="col-lg-4">
          <SectionCard
            title="1. Select Dataset Type"
            bodyClassName="p-3"
          >
            <p className="text-muted small mb-3">
              Choose the dataset type. The required CSV column headings will be shown below.
            </p>

            <div className="d-flex flex-column gap-2">
              {DATASETS.map((ds) => (
                <button
                  key={ds.job_name}
                  type="button"
                  onClick={() => {
                    setSelectedJob(ds);
                    reset();
                    setStage('select');
                  }}
                  className={`btn btn-sm text-start d-flex align-items-center gap-2 ${
                    selectedJob?.job_name === ds.job_name
                      ? 'btn-primary'
                      : 'btn-outline-secondary'
                  }`}
                >
                  <i className={`bi ${ds.icon} flex-shrink-0`} />
                  <div>
                    <div className="fw-semibold" style={{ fontSize: '0.82rem' }}>{ds.label}</div>
                    <div className="text-opacity-75" style={{ fontSize: '0.7rem' }}>{ds.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* ── Required headers info ─────────────────────────── */}
          {selectedJob && (
            <SectionCard title="Expected CSV Columns" className="mt-3" bodyClassName="p-3">
              <p className="text-muted small mb-2">Row 1 of your CSV must contain these headings:</p>
              <div className="mb-2">
                <span className="text-danger fw-semibold small">Required:</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {selectedJob.requiredCols.map((c) => (
                    <code key={c} className="badge bg-danger-subtle text-danger border border-danger-subtle">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-secondary fw-semibold small">Optional:</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {selectedJob.optionalCols.map((c) => (
                    <code key={c} className="badge bg-light text-secondary border">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right column: Upload + preview + actions ─────────── */}
        <div className="col-lg-8">

          {/* ── Drop zone ──────────────────────────────────────── */}
          {selectedJob && (
            <SectionCard
              title="2. Upload CSV File"
              className="mb-4"
              bodyClassName="p-3"
            >
              <div
                className={`border-2 border-dashed rounded-3 p-4 text-center ${
                  isDragging ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary-subtle bg-light'
                }`}
                style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <i className={`bi bi-file-earmark-spreadsheet fs-1 ${isDragging ? 'text-primary' : 'text-muted'}`} />
                <div className="mt-2 fw-semibold text-muted">
                  {isDragging ? 'Drop your CSV here…' : 'Drag & drop a CSV file, or click to browse'}
                </div>
                <div className="small text-muted mt-1">Only .csv files are accepted</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="d-none"
                  onChange={handleFileChange}
                />
              </div>

              {/* Validation messages */}
              {validationErrors.length > 0 && (
                <div className={`alert mt-3 mb-0 py-2 ${hasCriticalErrors ? 'alert-danger' : 'alert-warning'}`}>
                  <div className="d-flex align-items-start gap-2">
                    <i className={`bi ${hasCriticalErrors ? 'bi-x-circle-fill' : 'bi-exclamation-triangle-fill'} flex-shrink-0 mt-1`} />
                    <ul className="mb-0 ps-3 small">
                      {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Preview table ────────────────────────────────────── */}
          {parsed && !hasCriticalErrors && (
            <SectionCard
              title={`3. Data Preview — ${parsed.rows.length.toLocaleString()} row${parsed.rows.length !== 1 ? 's' : ''}`}
              className="mb-4"
              action={
                <button className="btn btn-sm btn-outline-secondary" onClick={reset}>
                  <i className="bi bi-x-lg me-1" />Clear
                </button>
              }
            >
              <div className="table-responsive" style={{ maxHeight: 360 }}>
                <table className="table table-sm table-hover table-bordered mb-0 align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="text-muted" style={{ width: 48 }}>#</th>
                      {previewCols.map((h) => (
                        <th key={h}>
                          <code className="small">{h}</code>
                          {selectedJob?.requiredCols.includes(h) && (
                            <span className="ms-1 text-danger small">*</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 200).map((row, i) => (
                      <tr key={i}>
                        <td className="text-muted">{i + 1}</td>
                        {previewCols.map((h) => (
                          <td key={h} className="text-truncate" style={{ maxWidth: 200 }}>
                            {row[h] || <span className="text-muted">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsed.rows.length > 200 && (
                <div className="px-3 pb-2 text-muted small">
                  <i className="bi bi-info-circle me-1" />
                  Showing first 200 rows of {parsed.rows.length.toLocaleString()}. All rows will be uploaded.
                </div>
              )}
            </SectionCard>
          )}

          {/* ── Action buttons ───────────────────────────────────── */}
          {parsed && !hasCriticalErrors && (
            <SectionCard title="4. Upload Actions" bodyClassName="p-3">
              <div className="row g-3">
                {/* Save to Supabase */}
                <div className="col-md-6">
                  <div className="border rounded-3 p-3 h-100 d-flex flex-column">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-database-fill-up fs-4 text-primary" />
                      <div>
                        <div className="fw-semibold">Save to Supabase</div>
                        <div className="text-muted small">Inserts rows into the {selectedJob?.label} table</div>
                      </div>
                    </div>

                    {saveResult && (
                      <div className={`alert py-2 mb-2 small ${saveResult.status === 'success' ? 'alert-success' : saveResult.status === 'partial' ? 'alert-warning' : 'alert-danger'}`}>
                        <i className={`bi me-1 ${saveResult.status === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
                        <strong>{saveResult.rows_inserted}</strong> inserted
                        {saveResult.rows_failed > 0 && <>, <strong className="text-danger">{saveResult.rows_failed}</strong> failed</>}
                        <div className="mt-1">
                          ETL Run: <code className="small">{saveResult.etl_run_id.slice(0, 8)}…</code>
                        </div>
                        {saveResult.errors.slice(0, 3).map((e, i) => (
                          <div key={i} className="text-danger small mt-1">{e}</div>
                        ))}
                      </div>
                    )}

                    {saveError && (
                      <div className="alert alert-danger py-2 mb-2 small">
                        <i className="bi bi-x-circle-fill me-1" />{saveError}
                      </div>
                    )}

                    <div className="mt-auto d-flex gap-2">
                      <button
                        className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1"
                        onClick={handleSave}
                        disabled={saving || !!saveResult}
                      >
                        {saving ? (
                          <><span className="spinner-border spinner-border-sm" role="status" />Saving…</>
                        ) : saveResult ? (
                          <><i className="bi bi-check-circle-fill" />Saved</>
                        ) : (
                          <><i className="bi bi-database-fill-up" />Save to Supabase</>
                        )}
                      </button>
                      {saveResult && (
                        <button
                          className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                          onClick={() => navigate('/etl-runs')}
                        >
                          <i className="bi bi-arrow-repeat" />View ETL Runs
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Push to Azure SQL */}
                <div className="col-md-6">
                  <div className="border rounded-3 p-3 h-100 d-flex flex-column">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-cloud-upload-fill fs-4 text-info" />
                      <div>
                        <div className="fw-semibold">Load to Azure SQL</div>
                        <div className="text-muted small">Pushes rows to the Azure SQL data warehouse</div>
                      </div>
                    </div>

                    {pushResult && (
                      <div className={`alert py-2 mb-2 small ${pushResult.status === 'success' ? 'alert-success' : pushResult.status === 'partial' ? 'alert-warning' : 'alert-danger'}`}>
                        <i className={`bi me-1 ${pushResult.status === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
                        <strong>{pushResult.rows_inserted}</strong> inserted
                        {pushResult.rows_failed > 0 && <>, <strong className="text-danger">{pushResult.rows_failed}</strong> failed</>}
                        <div className="mt-1">
                          ETL Run: <code className="small">{pushResult.etl_run_id.slice(0, 8)}…</code>
                        </div>
                        {pushResult.errors.slice(0, 3).map((e, i) => (
                          <div key={i} className="text-danger small mt-1">{e}</div>
                        ))}
                      </div>
                    )}

                    {pushError && (
                      <div className="alert alert-danger py-2 mb-2 small">
                        <i className="bi bi-x-circle-fill me-1" />{pushError}
                      </div>
                    )}

                    <div className="mt-auto d-flex gap-2">
                      <button
                        className="btn btn-info btn-sm text-white d-inline-flex align-items-center gap-1"
                        onClick={handlePushAzure}
                        disabled={pushing || !!pushResult}
                      >
                        {pushing ? (
                          <><span className="spinner-border spinner-border-sm" role="status" />Pushing…</>
                        ) : pushResult ? (
                          <><i className="bi bi-check-circle-fill" />Pushed</>
                        ) : (
                          <><i className="bi bi-cloud-upload-fill" />Load to Azure SQL</>
                        )}
                      </button>
                      {pushResult && (
                        <button
                          className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                          onClick={() => navigate('/etl-runs')}
                        >
                          <i className="bi bi-arrow-repeat" />View ETL Runs
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-muted small d-flex align-items-start gap-2">
                <i className="bi bi-info-circle flex-shrink-0 mt-1" />
                <span>
                  Both actions are independent — you can save to Supabase, load to Azure SQL, or both.
                  Each action creates a tracked <strong>ETL Run</strong> visible at{' '}
                  <button
                    className="btn btn-link btn-sm p-0 align-baseline"
                    onClick={() => navigate('/etl-runs')}
                  >
                    /etl-runs
                  </button>.
                </span>
              </div>
            </SectionCard>
          )}

          {/* ── Empty state ──────────────────────────────────────── */}
          {!selectedJob && (
            <div className="d-flex flex-column align-items-center justify-content-center text-center py-5 text-muted">
              <i className="bi bi-file-earmark-spreadsheet display-4 mb-3" />
              <h5>Select a dataset type to get started</h5>
              <p className="small">Choose from the list on the left, then upload your CSV file.</p>
            </div>
          )}

          {selectedJob && !parsed && (
            <div className="d-flex flex-column align-items-center justify-content-center text-center py-5 text-muted">
              <i className="bi bi-upload display-4 mb-3" />
              <h5>Upload a CSV file for <strong>{selectedJob.label}</strong></h5>
              <p className="small">
                Row 1 must contain the column headings listed on the left.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
