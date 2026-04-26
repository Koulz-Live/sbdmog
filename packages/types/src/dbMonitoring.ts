// packages/types/src/dbMonitoring.ts
// Shared TypeScript types for database monitoring log tables.

// ── Performance ───────────────────────────────────────────────────────────────
export type DbPerfStatus = 'healthy' | 'degraded' | 'critical' | 'unreachable' | 'unknown';

export interface DbPerformanceLog {
  id:                  string;
  checked_at:          string;
  status:              DbPerfStatus;
  duration_ms:         number;
  environment:         string;
  wait_stats:          WaitStat[] | null;
  slow_queries:        SlowQuery[] | null;
  blocking:            BlockingChain[] | null;
  cpu_pct:             number | null;
  memory_pct:          number | null;
  disk_read_ms:        number | null;
  disk_write_ms:       number | null;
  active_connections:  number | null;
  long_running_count:  number | null;
  details:             Record<string, unknown> | null;
  error_message:       string | null;
  ai_summary:          string | null;
  ai_actions:          string[] | null;
  ai_severity:         AiSeverity | null;
  ai_generated_at:     string | null;
  created_at:          string;
}

export interface WaitStat {
  wait_type:      string;
  waiting_tasks:  number;
  wait_time_ms:   number;
  signal_wait_ms: number;
  pct_of_total:   number;
}

export interface SlowQuery {
  avg_duration_ms:  number;
  execution_count:  number;
  avg_logical_reads: number;
  avg_cpu_ms:       number;
  query_text:       string;
}

export interface BlockingChain {
  blocking_spid:  number;
  blocked_spid:   number;
  wait_time_ms:   number;
  blocked_query:  string;
}

// ── Structural Integrity ───────────────────────────────────────────────────────
export type DbIntegrityStatus = 'passed' | 'warnings' | 'errors' | 'unreachable' | 'unknown';

export interface DbIntegrityLog {
  id:                    string;
  checked_at:            string;
  status:                DbIntegrityStatus;
  duration_ms:           number;
  environment:           string;
  object_checks:         ObjectCheck[] | null;
  allocation_errors:     number;
  consistency_errors:    number;
  page_count:            number | null;
  row_count_check:       RowCountCheck[] | null;
  log_space_used_pct:    number | null;
  log_reuse_wait:        string | null;
  disabled_constraints:  DisabledConstraint[] | null;
  details:               Record<string, unknown> | null;
  error_message:         string | null;
  ai_summary:            string | null;
  ai_actions:            string[] | null;
  ai_severity:           AiSeverity | null;
  ai_generated_at:       string | null;
  created_at:            string;
}

export interface ObjectCheck {
  object_name: string;
  row_count:   number;
  total_kb:    number;
  index_name:  string | null;
  index_type:  string | null;
}

export interface RowCountCheck {
  table_name:          string;
  row_count:           number;
  expected_range_min:  number | null;
  expected_range_max:  number | null;
  is_anomalous:        boolean;
}

export interface DisabledConstraint {
  table_name:       string;
  constraint_name:  string;
  type:             string;
}

// ── Data Integrity ─────────────────────────────────────────────────────────────
export interface DbDataIntegrityLog {
  id:               string;
  checked_at:       string;
  status:           DbIntegrityStatus;
  duration_ms:      number;
  environment:      string;
  null_checks:      NullCheck[] | null;
  ref_violations:   RefViolation[] | null;
  duplicate_checks: DuplicateCheck[] | null;
  range_checks:     RangeCheck[] | null;
  table_row_counts: TableRowCount[] | null;
  total_issues:     number;
  details:          Record<string, unknown> | null;
  error_message:    string | null;
  ai_summary:       string | null;
  ai_actions:       string[] | null;
  ai_severity:      AiSeverity | null;
  ai_generated_at:  string | null;
  created_at:       string;
}

export interface NullCheck {
  table_name:   string;
  column_name:  string;
  null_count:   number;
}

export interface RefViolation {
  parent_table: string;
  child_table:  string;
  orphan_count: number;
}

export interface DuplicateCheck {
  table_name:       string;
  column_name:      string;
  duplicate_count:  number;
}

export interface RangeCheck {
  table_name:     string;
  check_name:     string;
  anomaly_count:  number;
}

export interface TableRowCount {
  table_name: string;
  row_count:  number;
}

// ── Index Maintenance ─────────────────────────────────────────────────────────
export type DbIndexStatus = 'healthy' | 'warnings' | 'critical' | 'unreachable' | 'unknown';

export interface DbIndexLog {
  id:                    string;
  checked_at:            string;
  status:                DbIndexStatus;
  duration_ms:           number;
  environment:           string;
  index_stats:           IndexStat[] | null;
  total_indexes:         number;
  healthy_count:         number;
  reorganized_count:     number;
  rebuilt_count:         number;
  skipped_count:         number;
  top_fragmented:        IndexStat[] | null;
  avg_fragmentation_pct: number;
  missing_indexes:       MissingIndex[] | null;
  details:               Record<string, unknown> | null;
  error_message:         string | null;
  ai_summary:            string | null;
  ai_actions:            string[] | null;
  ai_severity:           AiSeverity | null;
  ai_generated_at:       string | null;
  created_at:            string;
}

export interface IndexStat {
  table_name:         string;
  index_name:         string;
  index_type:         string;
  fragmentation_pct:  number;
  page_count:         number;
  action_recommended: 'none' | 'reorganize' | 'rebuild' | 'skipped';
}

export interface MissingIndex {
  table_name:          string;
  impact_score:        number;
  equality_columns:    string | null;
  inequality_columns:  string | null;
  included_columns:    string | null;
  user_seeks:          number;
  user_scans:          number;
}

// ── Shared ────────────────────────────────────────────────────────────────────
export type AiSeverity = 'low' | 'medium' | 'high' | 'critical';
