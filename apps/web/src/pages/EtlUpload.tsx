// apps/web/src/pages/EtlUpload.tsx
// CSV → AI Conformance Check → Supabase → Azure SQL ETL Upload page.
// 1. User selects a dataset type (defines expected CSV headers)
// 2. Uploads a CSV file — parsed client-side by PapaParse
// 3. Headers are validated against the expected schema
// 4. AI Analysis — OpenAI scores conformance 0-100%, lists issues + recommendations
// 5. "Save to Supabase" → POST /api/etl-upload → inserts rows + creates etl_run
// 6. "Load to Azure SQL" → POST /api/etl-upload/push-azure → Azure SQL insert + etl_run

import React, { useRef, useState, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import { PageHeader }   from '../layout/PageHeader.js';
import { SectionCard }  from '../common/SectionCard.js';
import { apiPost, apiGet } from '../services/api.js';

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
  {
    label:        'Umalusi Matric Results',
    job_name:     'umalusi_matric_results',
    description:  'NSC matric examination results as certified by Umalusi.',
    requiredCols: [
      'candidate_number',
      'surname',
      'first_name',
      'id_number',
      'school_emis',
      'school_name',
      'province',
      'district',
      'examination_year',
      'subject_code',
      'subject_name',
      'mark',
      'symbol',
      'result_status',
    ],
    optionalCols: [
      'gender',
      'date_of_birth',
      'home_language',
      'qualification_type',
      'aggregate_mark',
      'distinction_count',
      'certificate_type',
      'endorsed',
      'special_needs',
      'centre_number',
      'remarks',
    ],
    icon: 'bi-mortarboard',
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

interface FieldStat {
  field:          string;
  required:       boolean;
  present:        boolean;
  non_empty_pct:  number;
  unique_count:   number;
  sample_values:  string[];
  has_nulls:      boolean;
  suspected_type: string;
}

interface AnalysisResult {
  output:            string;
  model:             string;
  prompt_tokens:     number;
  completion_tokens: number;
  field_stats:       FieldStat[];
  conformance_score: number | null;
}

type Stage = 'select' | 'preview' | 'analysing' | 'analysed' | 'saved' | 'pushed';

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractScore(text: string): number | null {
  const match = text.match(/CONFORMANCE SCORE:\s*(\d+)%/i);
  return match ? parseInt(match[1]!, 10) : null;
}

function scoreColour(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-danger';
}

function scoreBadgeClass(score: number): string {
  if (score >= 90) return 'bg-success';
  if (score >= 70) return 'bg-warning text-dark';
  return 'bg-danger';
}

function scoreIcon(score: number): string {
  if (score === 100) return 'bi-patch-check-fill';
  if (score >= 90)   return 'bi-check-circle-fill';
  if (score >= 70)   return 'bi-exclamation-triangle-fill';
  return 'bi-x-circle-fill';
}

function parseFieldAnalysis(text: string): { field: string; status: string; notes: string }[] {
  const section = text.match(/FIELD ANALYSIS:([\s\S]*?)(?:\n[A-Z][A-Z ]+:|$)/i)?.[1] ?? '';
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      return { field: parts[0] ?? '', status: parts[1] ?? '', notes: parts[2] ?? '' };
    })
    .filter((r) => r.field);
}

function extractSection(text: string, heading: string): string {
  const re = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?:\\n[A-Z][A-Z ]+:|$)`, 'i');
  return text.match(re)?.[1]?.trim() ?? '';
}

// ── Main component ────────────────────────────────────────────────────────────

export function EtlUpload() {
  const navigate = useNavigate();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [selectedJob, setSelectedJob]     = useState<DatasetDef | null>(null);
  const [parsed,      setParsed]          = useState<ParsedFile | null>(null);
  const [stage,       setStage]           = useState<Stage>('select');
  const [isDragging,  setIsDragging]      = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // AI analysis
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError,  setAnalysisError]  = useState<string | null>(null);

  // Results
  const [saveResult, setSaveResult]   = useState<UploadResult | null>(null);
  const [pushResult, setPushResult]   = useState<UploadResult | null>(null);

  // Loading states
  const [analysing, setAnalysing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [pushing, setPushing] = useState(false);

  // Error alerts
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  // SQL connection selection
  const [sqlConnections, setSqlConnections]     = useState<{ id: string; label: string; connection_type: string; is_default: boolean }[]>([]);
  const [selectedConnId, setSelectedConnId]     = useState<string>('');  // '' = use env default

  // ── Load active SQL connections for picker ──────────────────────────────

  useEffect(() => {
    apiGet<{ connections: { id: string; label: string; connection_type: string; is_default: boolean }[] }>('/sql-connections')
      .then((res) => setSqlConnections(res.connections ?? []))
      .catch(() => {}); // silently ignore — falls back to env default
  }, []);

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
        setAnalysisResult(null);
        setAnalysisError(null);
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
    setAnalysisResult(null);
    setAnalysisError(null);
    setSaveResult(null);
    setPushResult(null);
    setSaveError(null);
    setPushError(null);
  };

  // ── AI Analysis ──────────────────────────────────────────────────────────

  const handleAnalyse = async () => {
    if (!parsed || !selectedJob) return;
    setAnalysing(true);
    setAnalysisError(null);
    setStage('analysing');
    try {
      const raw = await apiPost<{
        output:            string;
        model:             string;
        prompt_tokens:     number;
        completion_tokens: number;
        field_stats:       FieldStat[];
      }>('/etl-upload/analyse', {
        job_name:      selectedJob.job_name,
        dataset_label: selectedJob.label,
        required_cols: selectedJob.requiredCols,
        optional_cols: selectedJob.optionalCols,
        headers:       parsed.headers,
        rows:          parsed.rows,
      });
      setAnalysisResult({ ...raw, conformance_score: extractScore(raw.output) });
      setStage('analysed');
    } catch (err) {
      setAnalysisError((err as Error).message);
      setStage('preview');
    } finally {
      setAnalysing(false);
    }
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
        job_name:      selectedJob.job_name,
        rows:          parsed.rows,
        connection_id: selectedConnId || undefined,
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

  const score        = analysisResult?.conformance_score ?? null;
  const fieldRows    = analysisResult ? parseFieldAnalysis(analysisResult.output) : [];
  const summaryText  = analysisResult ? extractSection(analysisResult.output, 'SUMMARY') : '';
  const issuesText   = analysisResult ? extractSection(analysisResult.output, 'ISSUES FOUND') : '';
  const recsText     = analysisResult ? extractSection(analysisResult.output, 'RECOMMENDATIONS') : '';
  const is100        = score === 100;

  const STAGE_KEYS: Stage[] = ['select', 'preview', 'analysed', 'saved', 'pushed'];
  const stageIdx = (s: Stage) => {
    if (s === 'analysing') return STAGE_KEYS.indexOf('analysed');
    return STAGE_KEYS.indexOf(s);
  };
  const currIdx = stageIdx(stage);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="ETL Upload"
        subtitle="Upload a CSV file, run AI conformance analysis, commit to Supabase, and restore to Azure SQL."
      />

      {/* ── Step indicator ─────────────────────────────────────── */}
      <div className="d-flex align-items-center gap-2 mb-4 flex-wrap">
        {[
          { key: 'select',   label: '1  Select dataset',       icon: 'bi-list-ul' },
          { key: 'preview',  label: '2  Preview & validate',   icon: 'bi-table' },
          { key: 'analysed', label: '3  AI conformance check', icon: 'bi-stars' },
          { key: 'saved',    label: '4  Committed to Supabase', icon: 'bi-database-check' },
          { key: 'pushed',   label: '5  Restored to Azure SQL', icon: 'bi-cloud-check' },
        ].map((step, i, arr) => {
          const stepIdx = STAGE_KEYS.indexOf(step.key as Stage);
          const done    = stepIdx < currIdx;
          const active  = stepIdx === currIdx || (step.key === 'analysed' && stage === 'analysing');

          return (
            <React.Fragment key={step.key}>
              <span
                className={`badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-2 ${
                  done   ? 'bg-success'
                  : active ? (stage === 'analysing' && step.key === 'analysed' ? 'bg-warning text-dark' : 'bg-primary')
                  : 'bg-light text-muted border'
                }`}
                style={{ fontSize: '0.78rem' }}
              >
                {stage === 'analysing' && step.key === 'analysed' ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: '0.65rem', height: '0.65rem' }} />
                ) : (
                  <i className={`bi ${done ? 'bi-check-circle-fill' : step.icon}`} />
                )}
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
        {/* ── Left column: Dataset selector ───────────────────── */}
        <div className="col-lg-4">
          <SectionCard title="1. Select Dataset Type" bodyClassName="p-3">
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
                    selectedJob?.job_name === ds.job_name ? 'btn-primary' : 'btn-outline-secondary'
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
                    <code key={c} className="badge bg-danger-subtle text-danger border border-danger-subtle">{c}</code>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-secondary fw-semibold small">Optional:</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {selectedJob.optionalCols.map((c) => (
                    <code key={c} className="badge bg-light text-secondary border">{c}</code>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── AI score summary (sidebar) ────────────────────── */}
          {analysisResult && score !== null && (
            <SectionCard className="mt-3" bodyClassName="p-3">
              <div className="text-center">
                <div className={`display-5 fw-bold ${scoreColour(score)}`}>{score}%</div>
                <div className="text-muted small mb-2">Conformance Score</div>
                <span className={`badge ${scoreBadgeClass(score)} px-3 py-2`}>
                  <i className={`bi ${scoreIcon(score)} me-1`} />
                  {score === 100 ? 'Perfect' : score >= 90 ? 'Good' : score >= 70 ? 'Fair' : 'Poor'}
                </span>
                {!is100 && (
                  <div className="mt-3 text-muted small">
                    <i className="bi bi-arrow-up-circle-fill text-primary me-1" />
                    Fix issues to reach 100% before uploading
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ── Right column ─────────────────────────────────────── */}
        <div className="col-lg-8">

          {/* ── Drop zone ──────────────────────────────────────── */}
          {selectedJob && (
            <SectionCard title="2. Upload CSV File" className="mb-4" bodyClassName="p-3">
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
                  {parsed
                    ? <><i className="bi bi-check-circle-fill text-success me-1" />{parsed.rows.length.toLocaleString()} rows loaded — click to replace file</>
                    : isDragging ? 'Drop your CSV here…' : 'Drag & drop a CSV file, or click to browse'
                  }
                </div>
                <div className="small text-muted mt-1">Only .csv files are accepted</div>
                <input ref={fileRef} type="file" accept=".csv" className="d-none" onChange={handleFileChange} />
              </div>

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
              <div className="table-responsive" style={{ maxHeight: 300 }}>
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

          {/* ── AI Conformance Analysis card ─────────────────────── */}
          {parsed && !hasCriticalErrors && (
            <SectionCard
              className="mb-4"
              title="3. Conformance Analysis"
              action={
                <div className="d-flex align-items-center gap-2">
                  {score !== null && (
                    <span className={`badge ${scoreBadgeClass(score)}`}>
                      <i className={`bi ${scoreIcon(score)} me-1`} />{score}% conformance
                    </span>
                  )}
                  <span className="badge bg-dark-subtle text-dark border" style={{ fontSize: '0.7rem' }}>
                    <i className="bi bi-stars me-1 text-warning" />AI
                  </span>
                  <button
                    className="btn btn-sm btn-outline-dark d-inline-flex align-items-center gap-1"
                    onClick={handleAnalyse}
                    disabled={analysing}
                  >
                    {analysing ? (
                      <><span className="spinner-border spinner-border-sm" role="status" />Analysing…</>
                    ) : analysisResult ? (
                      <><i className="bi bi-arrow-repeat" />Re-analyse</>
                    ) : (
                      <><i className="bi bi-stars" />Analyse with AI</>
                    )}
                  </button>
                </div>
              }
              bodyClassName="p-3"
            >
              {/* Empty state */}
              {!analysing && !analysisResult && !analysisError && (
                <div className="text-center py-4 text-muted">
                  <i className="bi bi-cpu display-5 mb-3 d-block" />
                  <div className="fw-semibold mb-1">Run AI Conformance Check</div>
                  <p className="small mb-3">
                    GPT-4o will analyse your dataset's field completeness, data types, null rates,
                    and uniqueness — then score it against a 100% conformance target.
                  </p>
                  <button
                    className="btn btn-dark d-inline-flex align-items-center gap-2"
                    onClick={handleAnalyse}
                  >
                    <i className="bi bi-stars text-warning" />
                    Run AI Conformance Check
                  </button>
                </div>
              )}

              {/* Loading state */}
              {analysing && (
                <div className="text-center py-4 text-muted">
                  <div className="spinner-border text-primary mb-3" role="status" />
                  <div className="fw-semibold">OpenAI is analysing your dataset…</div>
                  <div className="small mt-1">This may take up to 30 seconds.</div>
                </div>
              )}

              {/* Error state */}
              {analysisError && !analysing && (
                <div className="alert alert-danger py-2 small mb-0">
                  <i className="bi bi-x-circle-fill me-2" />{analysisError}
                </div>
              )}

              {/* Results */}
              {analysisResult && !analysing && (
                <>
                  {/* Score banner */}
                  <div className={`rounded-3 p-3 mb-3 ${
                    score === null ? 'bg-secondary-subtle'
                    : score >= 90 ? 'bg-success-subtle'
                    : score >= 70 ? 'bg-warning-subtle'
                    : 'bg-danger-subtle'
                  }`}>
                    <div className="d-flex align-items-center gap-3">
                      <div className={`fs-2 fw-bold ${scoreColour(score ?? 0)}`}>{score ?? '—'}%</div>
                      <div>
                        <div className="fw-semibold">{summaryText || 'Analysis complete'}</div>
                        <div className="text-muted small">
                          {analysisResult.model} · {analysisResult.prompt_tokens + analysisResult.completion_tokens} tokens
                        </div>
                      </div>
                      {!is100 && (
                        <div className="ms-auto">
                          <span className="badge bg-warning text-dark">
                            <i className="bi bi-exclamation-triangle-fill me-1" />
                            Fix issues before uploading
                          </span>
                        </div>
                      )}
                      {is100 && (
                        <div className="ms-auto">
                          <span className="badge bg-success">
                            <i className="bi bi-patch-check-fill me-1" />
                            Ready to upload
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Issues + Recommendations */}
                  {(issuesText || recsText) && (
                    <div className="row g-3 mb-3">
                      {issuesText && (
                        <div className="col-md-6">
                          <div className="border rounded-3 p-3 h-100 border-danger-subtle">
                            <div className="fw-semibold small mb-2 text-danger">
                              <i className="bi bi-exclamation-triangle-fill me-1" />Issues Found
                            </div>
                            <pre className="small text-body mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>
                              {issuesText}
                            </pre>
                          </div>
                        </div>
                      )}
                      {recsText && (
                        <div className="col-md-6">
                          <div className="border rounded-3 p-3 h-100 border-primary-subtle">
                            <div className="fw-semibold small mb-2 text-primary">
                              <i className="bi bi-lightbulb-fill me-1" />Recommendations
                            </div>
                            <pre className="small text-body mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem' }}>
                              {recsText}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Field analysis table */}
                  {fieldRows.length > 0 && (
                    <div className="mb-3">
                      <div className="fw-semibold small mb-2">
                        <i className="bi bi-table me-1" />Field Analysis
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered mb-0 align-middle" style={{ fontSize: '0.78rem' }}>
                          <thead className="table-light">
                            <tr>
                              <th>Field</th>
                              <th style={{ width: 100 }}>Status</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fieldRows.map((fr, i) => (
                              <tr
                                key={i}
                                className={
                                  fr.status.includes('✗') ? 'table-danger'
                                  : fr.status.includes('⚠') ? 'table-warning'
                                  : 'table-success'
                                }
                              >
                                <td><code className="small">{fr.field}</code></td>
                                <td>{fr.status}</td>
                                <td className="text-muted">{fr.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Re-upload prompt when not 100% */}
                  {!is100 && (
                    <div className="alert alert-warning py-2 mb-0 d-flex align-items-center gap-2">
                      <i className="bi bi-arrow-repeat flex-shrink-0" />
                      <span className="small">
                        Fix the issues above in your CSV file, then{' '}
                        <button
                          className="btn btn-link btn-sm p-0 align-baseline"
                          onClick={() => fileRef.current?.click()}
                        >
                          re-upload
                        </button>{' '}
                        and re-analyse to reach 100% conformance before loading to Azure SQL.
                      </span>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {/* ── Upload Actions card (only after analysis) ─────────── */}
          {parsed && !hasCriticalErrors && (stage === 'analysed' || stage === 'saved' || stage === 'pushed') && (
            <SectionCard title="4. Upload Actions" bodyClassName="p-3">
              {/* Score gate warning */}
              {score !== null && score < 70 && (
                <div className="alert alert-danger py-2 mb-3 small d-flex align-items-center gap-2">
                  <i className="bi bi-shield-exclamation flex-shrink-0" />
                  <span>
                    Conformance score is <strong>{score}%</strong> — below the 70% threshold.
                    It is strongly recommended to fix data quality issues before uploading.
                  </span>
                </div>
              )}

              <div className="row g-3">
                {/* Save to Supabase */}
                <div className="col-md-6">
                  <div className="border rounded-3 p-3 h-100 d-flex flex-column">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-database-fill-up fs-4 text-primary" />
                      <div>
                        <div className="fw-semibold">Commit to Supabase</div>
                        <div className="text-muted small">Inserts rows into the {selectedJob?.label} table</div>
                      </div>
                    </div>

                    {saveResult && (
                      <div className={`alert py-2 mb-2 small ${saveResult.status === 'success' ? 'alert-success' : saveResult.status === 'partial' ? 'alert-warning' : 'alert-danger'}`}>
                        <i className={`bi me-1 ${saveResult.status === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
                        <strong>{saveResult.rows_inserted}</strong> inserted
                        {saveResult.rows_failed > 0 && <>, <strong className="text-danger">{saveResult.rows_failed}</strong> failed</>}
                        <div className="mt-1">ETL Run: <code className="small">{saveResult.etl_run_id.slice(0, 8)}…</code></div>
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
                          <><span className="spinner-border spinner-border-sm" role="status" />Committing…</>
                        ) : saveResult ? (
                          <><i className="bi bi-check-circle-fill" />Committed</>
                        ) : (
                          <><i className="bi bi-database-fill-up" />Commit to Supabase</>
                        )}
                      </button>
                      {saveResult && (
                        <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => navigate('/etl-runs')}>
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
                        <div className="fw-semibold">Restore to Azure SQL</div>
                        <div className="text-muted small">Pushes rows to the Azure SQL data warehouse</div>
                      </div>
                    </div>

                    {pushResult && (
                      <div className={`alert py-2 mb-2 small ${pushResult.status === 'success' ? 'alert-success' : pushResult.status === 'partial' ? 'alert-warning' : 'alert-danger'}`}>
                        <i className={`bi me-1 ${pushResult.status === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
                        <strong>{pushResult.rows_inserted}</strong> inserted
                        {pushResult.rows_failed > 0 && <>, <strong className="text-danger">{pushResult.rows_failed}</strong> failed</>}
                        <div className="mt-1">ETL Run: <code className="small">{pushResult.etl_run_id.slice(0, 8)}…</code></div>
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

                    {/* Connection target selector */}
                    <div className="mb-3">
                      <label className="form-label small fw-semibold mb-1">Target SQL Connection</label>
                      <select
                        className="form-select form-select-sm font-monospace"
                        value={selectedConnId}
                        onChange={(e) => setSelectedConnId(e.target.value)}
                        disabled={pushing || !!pushResult}
                      >
                        <option value="">Default (environment)</option>
                        {sqlConnections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.connection_type === 'azure_sql' ? '☁ ' : '🖥 '}
                            {c.label}{c.is_default ? ' ★' : ''}
                          </option>
                        ))}
                      </select>
                      {sqlConnections.length === 0 && (
                        <div className="form-text text-muted">
                          <i className="bi bi-info-circle me-1" />
                          Using env-var default.{' '}
                          <a href="/sql-connections">Manage connections →</a>
                        </div>
                      )}
                    </div>

                    <div className="mt-auto d-flex gap-2">
                      <button
                        className="btn btn-info btn-sm text-white d-inline-flex align-items-center gap-1"
                        onClick={handlePushAzure}
                        disabled={pushing || !!pushResult}
                      >
                        {pushing ? (
                          <><span className="spinner-border spinner-border-sm" role="status" />Restoring…</>
                        ) : pushResult ? (
                          <><i className="bi bi-check-circle-fill" />Restored</>
                        ) : (
                          <><i className="bi bi-cloud-upload-fill" />Restore to Azure SQL</>
                        )}
                      </button>
                      {pushResult && (
                        <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => navigate('/etl-runs')}>
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
                  Both actions are independent — you can commit to Supabase, restore to Azure SQL, or both.
                  Each action creates a tracked <strong>ETL Run</strong> visible at{' '}
                  <button className="btn btn-link btn-sm p-0 align-baseline" onClick={() => navigate('/etl-runs')}>
                    /etl-runs
                  </button>.
                </span>
              </div>
            </SectionCard>
          )}

          {/* ── Empty states ─────────────────────────────────────── */}
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
              <p className="small">Row 1 must contain the column headings listed on the left.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
