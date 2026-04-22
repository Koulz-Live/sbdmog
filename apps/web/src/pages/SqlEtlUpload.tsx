// apps/web/src/pages/SqlEtlUpload.tsx
// SQL-to-SQL / SQL-to-Supabase ETL page.
//
// Pipeline:
//   1. Pick a source SQL connection  →  write a SELECT query
//   2. Extract preview (up to 3 000 rows)
//   3. Configure targets:
//        a. Supabase  — pick dataset / optionally map columns
//        b. SQL dest  — pick dest connection + enter target table name
//   4. Run — loads into both (or either) target(s), shows per-target ETL run results

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate }  from 'react-router-dom';
import { PageHeader }   from '../layout/PageHeader.js';
import { SectionCard }  from '../common/SectionCard.js';
import { apiGet, apiPost } from '../services/api.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SqlConnOption {
  id:              string;
  label:           string;
  connection_type: 'azure_sql' | 'windows_sql';
  is_default:      boolean;
}

interface ExtractResult {
  columns:         string[];
  rows:            Record<string, unknown>[];
  total_extracted: number;
  truncated:       boolean;
}

interface TargetResult {
  etl_run_id:    string;
  rows_inserted: number;
  rows_failed:   number;
  status:        'success' | 'partial' | 'failed';
  errors:        string[];
}

interface RunResult {
  rows_extracted: number;
  supabase?:      TargetResult;
  sql?:           TargetResult;
  status:         'success' | 'partial' | 'failed';
}

// Dataset keys that map to Supabase tables (mirrors backend)
const DATASET_OPTIONS: { value: string; label: string }[] = [
  { value: 'incidents',              label: 'Incidents' },
  { value: 'backup_runs',            label: 'Backup Runs' },
  { value: 'maintenance_activities', label: 'Maintenance Activities' },
  { value: 'security_findings',      label: 'Security Findings' },
  { value: 'popia_events',           label: 'POPIA Events' },
  { value: 'change_requests',        label: 'Change Requests' },
  { value: 'handover_items',         label: 'Handover Items' },
  { value: 'submission_readiness',   label: 'Submission Readiness' },
  { value: 'umalusi_matric_results', label: 'Umalusi Matric Results' },
];

// Allowed Supabase columns per dataset (mirrors backend whitelist exactly)
const ALLOWED_COLS: Record<string, string[]> = {
  incidents:              ['title','severity','category','affected_system','assigned_to','description','status'],
  backup_runs:            ['job_name','server_name','database_name','status','started_at','finished_at','size_gb'],
  maintenance_activities: ['title','system_name','maintenance_type','scheduled_start','scheduled_end','assigned_to','notes','status'],
  security_findings:      ['title','severity','category','affected_system','discovered_at','remediation_notes','status'],
  popia_events:           ['event_type','description','data_subject_count','reported_at','outcome'],
  change_requests:        ['title','change_type','requested_by','target_date','justification','risk_level','status'],
  handover_items:         ['title','category','priority','assigned_to','due_date','notes','status'],
  submission_readiness:   ['dataset_name','period','status','notes'],
  umalusi_matric_results: [
    'candidate_number','surname','first_name','id_number','school_emis','school_name',
    'province','district','examination_year','subject_code','subject_name','mark','symbol',
    'result_status','gender','date_of_birth','home_language','qualification_type',
    'aggregate_mark','distinction_count','certificate_type','endorsed','special_needs',
    'centre_number','remarks',
  ],
};

type Stage = 'config' | 'extracting' | 'preview' | 'running' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: 'success' | 'partial' | 'failed') {
  const map = {
    success: { cls: 'bg-success', icon: 'bi-check-circle-fill', label: 'Success' },
    partial: { cls: 'bg-warning text-dark', icon: 'bi-exclamation-triangle-fill', label: 'Partial' },
    failed:  { cls: 'bg-danger',  icon: 'bi-x-circle-fill',     label: 'Failed' },
  };
  const { cls, icon, label } = map[status];
  return (
    <span className={`badge ${cls} d-inline-flex align-items-center gap-1`}>
      <i className={`bi ${icon}`} />{label}
    </span>
  );
}

function connLabel(c: SqlConnOption) {
  return `${c.connection_type === 'azure_sql' ? '☁ ' : '🖥 '}${c.label}${c.is_default ? ' ★' : ''}`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SqlEtlUpload() {
  const navigate = useNavigate();

  // ── SQL connections ─────────────────────────────────────────────────────────
  const [connections, setConnections] = useState<SqlConnOption[]>([]);

  useEffect(() => {
    apiGet<{ connections: SqlConnOption[] }>('/sql-connections')
      .then((r) => setConnections(r.connections ?? []))
      .catch(() => {});
  }, []);

  // ── Stage ───────────────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('config');

  // ── Source config ───────────────────────────────────────────────────────────
  const [sourceId,    setSourceId]    = useState<string>('');
  const [query,       setQuery]       = useState<string>('SELECT TOP 1000 * FROM dbo.YourTable');
  const [rowLimit,    setRowLimit]    = useState<number>(3000);

  // ── Extraction result ────────────────────────────────────────────────────────
  const [extracted,    setExtracted]    = useState<ExtractResult | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // ── Supabase target ─────────────────────────────────────────────────────────
  const [sbEnabled,  setSbEnabled]  = useState(true);
  const [sbDataset,  setSbDataset]  = useState<string>('');
  // column_map: sourceName → supabaseColName
  const [colMap,     setColMap]     = useState<Record<string, string>>({});

  // ── SQL destination target ───────────────────────────────────────────────────
  const [sqlEnabled,  setSqlEnabled]  = useState(false);
  const [destId,      setDestId]      = useState<string>('');
  const [destTable,   setDestTable]   = useState<string>('dbo.');

  // ── Run result ───────────────────────────────────────────────────────────────
  const [runResult,  setRunResult]  = useState<RunResult | null>(null);
  const [runError,   setRunError]   = useState<string | null>(null);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStage('config');
    setExtracted(null);
    setExtractError(null);
    setRunResult(null);
    setRunError(null);
    setColMap({});
  }, []);

  // When dataset changes, reset colMap (columns differ)
  const handleDatasetChange = (val: string) => {
    setSbDataset(val);
    setColMap({});
  };

  // ── Extract ──────────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!sourceId || !query.trim()) return;
    setStage('extracting');
    setExtractError(null);
    setExtracted(null);
    try {
      const result = await apiPost<ExtractResult>('/sql-etl-upload/extract', {
        source_connection_id: sourceId,
        query:                query.trim(),
        row_limit:            rowLimit,
      });
      setExtracted(result);
      setStage('preview');
    } catch (err) {
      setExtractError((err as Error).message);
      setStage('config');
    }
  };

  // ── Column map helpers ────────────────────────────────────────────────────────
  const setMapping = (srcCol: string, destCol: string) => {
    setColMap((prev) => {
      const next = { ...prev };
      if (destCol) {
        next[srcCol] = destCol;
      } else {
        delete next[srcCol];
      }
      return next;
    });
  };

  // ── Run ───────────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (!extracted) return;

    // Validation
    if (sbEnabled && !sbDataset) {
      alert('Please select a Supabase dataset target.');
      return;
    }
    if (sqlEnabled && (!destId || !destTable.trim())) {
      alert('Please select a destination SQL connection and enter a table name.');
      return;
    }
    if (!sbEnabled && !sqlEnabled) {
      alert('Enable at least one target (Supabase or SQL destination).');
      return;
    }

    setStage('running');
    setRunError(null);

    const sourceConn = connections.find((c) => c.id === sourceId);

    const body: Record<string, unknown> = {
      source_label: sourceConn?.label ?? 'SQL ETL',
      rows:         extracted.rows,
      column_map:   Object.keys(colMap).length > 0 ? colMap : undefined,
      targets: {
        ...(sbEnabled  ? { supabase: { job_name: sbDataset } } : {}),
        ...(sqlEnabled ? { sql: { connection_id: destId, table_name: destTable.trim() } } : {}),
      },
    };

    try {
      const result = await apiPost<RunResult>('/sql-etl-upload/run', body);
      setRunResult(result);
      setStage('done');
    } catch (err) {
      setRunError((err as Error).message);
      setStage('preview');
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const sourceCols    = extracted?.columns ?? [];
  const allowedForDs  = sbDataset ? (ALLOWED_COLS[sbDataset] ?? []) : [];
  const canExtract    = !!sourceId && query.trim().length > 0 && stage !== 'extracting';
  const canRun        = !!extracted && stage !== 'extracting' && stage !== 'running';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="container-fluid px-3 px-md-4 py-4">

      <PageHeader
        title="SQL ETL Upload"
        subtitle="Extract from the source of truth, refine, and restore to your destinations"
        actions={
          stage !== 'config' ? (
            <button className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={reset}>
              <i className="bi bi-arrow-counterclockwise" />Start over
            </button>
          ) : undefined
        }
      />

      {/* ── STEP 1 — Source & Query ─────────────────────────────────────────── */}
      <SectionCard
        title="Step 1 — Appoint a Source"
        className="mb-3"
      >
        {connections.length === 0 ? (
          <div className="alert alert-warning d-flex align-items-center gap-2 mb-0 small">
            <i className="bi bi-exclamation-triangle-fill" />
            No active SQL connections found.{' '}
            <a href="/sql-connections" className="alert-link">Configure connections →</a>
          </div>
        ) : (
          <div className="row g-3">
            {/* Source connection picker */}
            <div className="col-md-4">
              <label className="form-label fw-semibold small">Source Connection <span className="text-danger">*</span></label>
              <select
                className="form-select form-select-sm font-monospace"
                value={sourceId}
                onChange={(e) => { setSourceId(e.target.value); reset(); }}
                disabled={stage === 'extracting'}
              >
                <option value="">— select source —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{connLabel(c)}</option>
                ))}
              </select>
            </div>

            {/* Row limit */}
            <div className="col-md-2">
              <label className="form-label fw-semibold small">Row Limit</label>
              <select
                className="form-select form-select-sm"
                value={rowLimit}
                onChange={(e) => setRowLimit(Number(e.target.value))}
                disabled={stage === 'extracting'}
              >
                {[100, 500, 1000, 2000, 3000, 5000, 10000].map((n) => (
                  <option key={n} value={n}>{n.toLocaleString()}</option>
                ))}
              </select>
            </div>

            {/* SELECT query */}
            <div className="col-12">
              <label className="form-label fw-semibold small">
                SELECT Query <span className="text-danger">*</span>
                <span className="text-muted fw-normal ms-2">(only SELECT / WITH … SELECT allowed)</span>
              </label>
              <textarea
                className="form-control form-control-sm font-monospace"
                rows={5}
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (extracted) { setExtracted(null); setStage('config'); } }}
                disabled={stage === 'extracting'}
                placeholder="SELECT TOP 1000 * FROM dbo.YourTable WHERE ..."
                spellCheck={false}
              />
            </div>

            {/* Extract error */}
            {extractError && (
              <div className="col-12">
                <div className="alert alert-danger py-2 mb-0 small d-flex align-items-start gap-2">
                  <i className="bi bi-x-circle-fill flex-shrink-0 mt-1" />
                  <div><strong>Extraction failed:</strong> {extractError}</div>
                </div>
              </div>
            )}

            {/* Extract button */}
            <div className="col-12">
              <button
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                onClick={handleExtract}
                disabled={!canExtract}
              >
                {stage === 'extracting' ? (
                  <><span className="spinner-border spinner-border-sm" role="status" />Extracting…</>
                ) : (
                  <><i className="bi bi-play-circle-fill" />Extract Data</>
                )}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── STEP 2 — Preview ───────────────────────────────────────────────── */}
      {extracted && (
        <SectionCard
          title={`Step 2 — Examine the Record (${extracted.total_extracted.toLocaleString()} rows extracted)`}
          className="mb-3"
        >
          {extracted.truncated && (
            <div className="alert alert-info py-2 small mb-2 d-flex align-items-center gap-2">
              <i className="bi bi-info-circle-fill" />
              Results were truncated to {rowLimit.toLocaleString()} rows. Refine your query or increase the limit.
            </div>
          )}
          {/* Scrollable table — first 20 rows for preview */}
          <div className="table-responsive rounded border" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table table-sm table-hover table-bordered mb-0 small font-monospace">
              <thead className="table-dark sticky-top">
                <tr>
                  {extracted.columns.map((col) => (
                    <th key={col} className="text-nowrap px-2 py-1" style={{ fontSize: '0.72rem' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {extracted.rows.slice(0, 20).map((row, ri) => (
                  <tr key={ri}>
                    {extracted.columns.map((col) => (
                      <td key={col} className="px-2 py-1 text-nowrap" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row[col] == null ? <span className="text-muted">NULL</span> : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {extracted.rows.length > 20 && (
            <div className="text-muted small mt-1">
              <i className="bi bi-eye me-1" />Showing first 20 of {extracted.total_extracted.toLocaleString()} extracted rows.
            </div>
          )}
        </SectionCard>
      )}

      {/* ── STEP 3 — Targets ─────────────────────────────────────────────────── */}
      {extracted && (
        <SectionCard
          title="Step 3 — Appoint Destinations"
          className="mb-3"
        >
          <div className="row g-4">

            {/* ── Target A: Supabase ── */}
            <div className="col-lg-6">
              <div className={`border rounded-3 p-3 h-100 ${sbEnabled ? 'border-success border-2' : 'opacity-75'}`}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-database-fill-check fs-5 text-success" />
                    <span className="fw-semibold">Supabase</span>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="sb-toggle"
                      checked={sbEnabled}
                      onChange={(e) => setSbEnabled(e.target.checked)}
                      disabled={stage === 'running'}
                    />
                    <label className="form-check-label small" htmlFor="sb-toggle">
                      {sbEnabled ? 'Enabled' : 'Disabled'}
                    </label>
                  </div>
                </div>

                {sbEnabled && (
                  <>
                    {/* Dataset selector */}
                    <div className="mb-3">
                      <label className="form-label small fw-semibold mb-1">
                        Target Dataset <span className="text-danger">*</span>
                      </label>
                      <select
                        className="form-select form-select-sm"
                        value={sbDataset}
                        onChange={(e) => handleDatasetChange(e.target.value)}
                        disabled={stage === 'running'}
                      >
                        <option value="">— select dataset —</option>
                        {DATASET_OPTIONS.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Column mapping */}
                    {sbDataset && sourceCols.length > 0 && (
                      <div>
                        <div className="fw-semibold small mb-1 d-flex align-items-center gap-1">
                          <i className="bi bi-shuffle" />Column Mapping
                          <span className="text-muted fw-normal">(source → Supabase)</span>
                        </div>
                        <div className="text-muted mb-2" style={{ fontSize: '0.72rem' }}>
                          Map source columns to allowed Supabase columns. Unmapped columns are dropped.
                        </div>
                        <div className="table-responsive rounded border" style={{ maxHeight: 260, overflowY: 'auto' }}>
                          <table className="table table-sm table-hover mb-0 small">
                            <thead className="table-light sticky-top">
                              <tr>
                                <th style={{ width: '45%' }}>Source column</th>
                                <th>→ Supabase column</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sourceCols.map((sc) => {
                                // Auto-suggest: if source col exactly matches an allowed col
                                const autoMatch = allowedForDs.includes(sc) ? sc : '';
                                const current   = colMap[sc] ?? autoMatch;
                                return (
                                  <tr key={sc}>
                                    <td className="font-monospace py-1 align-middle text-nowrap" style={{ fontSize: '0.72rem' }}>
                                      {sc}
                                    </td>
                                    <td className="py-1">
                                      <select
                                        className={`form-select form-select-sm py-0 ${current ? 'border-success' : 'border-secondary opacity-50'}`}
                                        style={{ fontSize: '0.72rem' }}
                                        value={current}
                                        onChange={(e) => setMapping(sc, e.target.value)}
                                        disabled={stage === 'running'}
                                      >
                                        <option value="">— skip —</option>
                                        {allowedForDs.map((ac) => (
                                          <option key={ac} value={ac}>{ac}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-muted mt-1" style={{ fontSize: '0.72rem' }}>
                          <i className="bi bi-info-circle me-1" />
                          {Object.values(colMap).filter(Boolean).length + sourceCols.filter((sc) => allowedForDs.includes(sc) && !colMap[sc]).length} column(s) will be loaded.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ── Target B: SQL destination ── */}
            <div className="col-lg-6">
              <div className={`border rounded-3 p-3 h-100 ${sqlEnabled ? 'border-info border-2' : 'opacity-75'}`}>
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-cloud-upload-fill fs-5 text-info" />
                    <span className="fw-semibold">SQL Destination</span>
                  </div>
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="sql-toggle"
                      checked={sqlEnabled}
                      onChange={(e) => setSqlEnabled(e.target.checked)}
                      disabled={stage === 'running'}
                    />
                    <label className="form-check-label small" htmlFor="sql-toggle">
                      {sqlEnabled ? 'Enabled' : 'Disabled'}
                    </label>
                  </div>
                </div>

                {sqlEnabled && (
                  <>
                    <div className="mb-3">
                      <label className="form-label small fw-semibold mb-1">
                        Destination Connection <span className="text-danger">*</span>
                      </label>
                      <select
                        className="form-select form-select-sm font-monospace"
                        value={destId}
                        onChange={(e) => setDestId(e.target.value)}
                        disabled={stage === 'running'}
                      >
                        <option value="">— select destination —</option>
                        {connections
                          .filter((c) => c.id !== sourceId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>{connLabel(c)}</option>
                          ))}
                      </select>
                      {connections.filter((c) => c.id !== sourceId).length === 0 && (
                        <div className="form-text text-warning">
                          <i className="bi bi-exclamation-triangle me-1" />
                          Only one connection available — source and destination must differ.{' '}
                          <a href="/sql-connections">Add another →</a>
                        </div>
                      )}
                    </div>

                    <div className="mb-2">
                      <label className="form-label small fw-semibold mb-1">
                        Target Table <span className="text-danger">*</span>
                        <span className="text-muted fw-normal ms-2">(e.g. dbo.UmalusiMatricResults)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm font-monospace"
                        value={destTable}
                        onChange={(e) => setDestTable(e.target.value)}
                        disabled={stage === 'running'}
                        placeholder="dbo.TargetTable"
                      />
                    </div>

                    <div className="alert alert-secondary py-2 mb-0 small">
                      <i className="bi bi-info-circle me-1" />
                      Columns are inserted using the <strong>source column names as-is</strong>.
                      Use SQL aliases in your SELECT query to match the destination schema
                      (e.g. <code>SELECT CandidateNo AS candidate_number …</code>).
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── STEP 4 — Run & Results ─────────────────────────────────────────── */}
      {extracted && (
        <SectionCard
          title="Step 4 — Commit &amp; Restore"
          className="mb-3"
        >
          {runError && (
            <div className="alert alert-danger py-2 small d-flex align-items-start gap-2 mb-3">
              <i className="bi bi-x-circle-fill flex-shrink-0 mt-1" />
              <div><strong>Load failed:</strong> {runError}</div>
            </div>
          )}

          {/* Per-target results */}
          {runResult && (
            <div className="row g-3 mb-3">
              {runResult.supabase && (
                <div className="col-md-6">
                  <div className="border rounded-3 p-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-database-fill-check text-success fs-5" />
                      <span className="fw-semibold">Supabase</span>
                      {statusBadge(runResult.supabase.status)}
                    </div>
                    <div className="small">
                      <span className="text-success fw-semibold">{runResult.supabase.rows_inserted}</span> inserted
                      {runResult.supabase.rows_failed > 0 && (
                        <>, <span className="text-danger fw-semibold">{runResult.supabase.rows_failed}</span> failed</>
                      )}
                    </div>
                    <div className="text-muted small mt-1">
                      ETL Run: <code className="small">{runResult.supabase.etl_run_id.slice(0, 8)}…</code>
                    </div>
                    {runResult.supabase.errors.slice(0, 3).map((e, i) => (
                      <div key={i} className="text-danger small mt-1 text-truncate">{e}</div>
                    ))}
                  </div>
                </div>
              )}
              {runResult.sql && (
                <div className="col-md-6">
                  <div className="border rounded-3 p-3">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className="bi bi-cloud-upload-fill text-info fs-5" />
                      <span className="fw-semibold">SQL Destination</span>
                      {statusBadge(runResult.sql.status)}
                    </div>
                    <div className="small">
                      <span className="text-success fw-semibold">{runResult.sql.rows_inserted}</span> inserted
                      {runResult.sql.rows_failed > 0 && (
                        <>, <span className="text-danger fw-semibold">{runResult.sql.rows_failed}</span> failed</>
                      )}
                    </div>
                    <div className="text-muted small mt-1">
                      ETL Run: <code className="small">{runResult.sql.etl_run_id.slice(0, 8)}…</code>
                    </div>
                    {runResult.sql.errors.slice(0, 3).map((e, i) => (
                      <div key={i} className="text-danger small mt-1 text-truncate">{e}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="d-flex gap-2 flex-wrap">
            <button
              className="btn btn-success d-inline-flex align-items-center gap-2"
              onClick={handleRun}
              disabled={!canRun}
            >
              {stage === 'running' ? (
                <><span className="spinner-border spinner-border-sm" role="status" />Committing…</>
              ) : stage === 'done' ? (
                <><i className="bi bi-check-circle-fill" />Committed</>
              ) : (
                <><i className="bi bi-send-fill" />Commit to Destinations</>
              )}
            </button>

            {stage === 'done' && (
              <button
                className="btn btn-outline-secondary d-inline-flex align-items-center gap-1"
                onClick={() => navigate('/etl-runs')}
              >
                <i className="bi bi-arrow-repeat" />View ETL Runs
              </button>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
