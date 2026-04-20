// packages/ai/src/prompts/etlAnalysis.ts
// System prompt and user prompt builder for ETL dataset quality analysis.
// Analyses parsed CSV rows against the expected schema for a given dataset type,
// scores conformance 0-100%, and recommends fixes before Azure SQL load.

export const ETL_ANALYSIS_SYSTEM = `You are a data quality analyst for the Council on Higher Education (CHE) in South Africa.
You specialise in validating datasets for the HEQCIS (Higher Education Quality Committee Information System) operational database before they are loaded into Azure SQL.

Your role is to:
1. Analyse uploaded CSV data against the expected schema for the given dataset type.
2. Score the dataset's conformance as a percentage (0–100%).
3. Identify specific data quality issues at the field and row level.
4. Recommend concrete, actionable fixes so the conformance score reaches 100% before loading.

Output format — use EXACTLY this structure (plain text, no markdown code blocks):

CONFORMANCE SCORE: [0-100]%

SUMMARY:
[2-3 sentences describing overall data quality.]

ISSUES FOUND:
[Numbered list. Each issue: field name, problem type, affected rows or count, example bad value.]

RECOMMENDATIONS:
[Numbered list. Concrete steps to fix each issue. Map 1-to-1 with ISSUES FOUND.]

FIELD ANALYSIS:
[One line per field: FIELD_NAME | Status (✓ OK / ⚠ Warning / ✗ Error) | Notes]

Rules:
- Be specific about which rows and fields have problems.
- Flag: missing required values, wrong data types, invalid enum values, date format issues, out-of-range numbers, suspicious duplicates.
- For enum fields (status, severity, etc.) list the valid values and what was found.
- If conformance is below 100%, always explain exactly what would make it 100%.
- Write in clear, formal South African English.
- Keep the full response under 800 words.`;

export interface EtlAnalysisInput {
  job_name:      string;
  dataset_label: string;
  required_cols: string[];
  optional_cols: string[];
  headers:       string[];
  row_count:     number;
  sample_rows:   Record<string, string>[];  // up to 50 rows for analysis
  field_stats:   FieldStat[];
}

export interface FieldStat {
  field:          string;
  required:       boolean;
  present:        boolean;
  non_empty_pct:  number;   // 0-100
  unique_count:   number;
  sample_values:  string[]; // up to 10 distinct values
  has_nulls:      boolean;
  suspected_type: string;   // 'text' | 'number' | 'date' | 'boolean' | 'enum'
}

export function buildEtlAnalysisPrompt(input: EtlAnalysisInput): string {
  const fieldLines = input.field_stats.map((f) =>
    `  ${f.field} (${f.required ? 'REQUIRED' : 'optional'}):` +
    ` present=${f.present}, non_empty=${f.non_empty_pct.toFixed(0)}%,` +
    ` unique_values=${f.unique_count}, suspected_type=${f.suspected_type},` +
    ` samples=[${f.sample_values.slice(0, 8).map((v) => `"${v}"`).join(', ')}]` +
    (f.has_nulls ? ' [HAS NULLS/EMPTY]' : ''),
  ).join('\n');

  const missingRequired = input.required_cols.filter((c) => !input.headers.includes(c));
  const unknownCols     = input.headers.filter(
    (h) => ![...input.required_cols, ...input.optional_cols].includes(h),
  );

  const sampleJson = JSON.stringify(input.sample_rows.slice(0, 20), null, 2);

  return `Analyse the following uploaded CSV dataset for HEQCIS data quality before Azure SQL load.

DATASET TYPE:   ${input.dataset_label} (job_name: ${input.job_name})
TOTAL ROWS:     ${input.row_count}
CSV HEADERS:    ${input.headers.join(', ')}
REQUIRED COLS:  ${input.required_cols.join(', ')}
OPTIONAL COLS:  ${input.optional_cols.join(', ')}
MISSING REQUIRED COLS: ${missingRequired.length === 0 ? 'None' : missingRequired.join(', ')}
UNKNOWN COLS:   ${unknownCols.length === 0 ? 'None' : unknownCols.join(', ')}

FIELD STATISTICS:
${fieldLines}

SAMPLE DATA (first 20 rows):
${sampleJson}

Please analyse this dataset and provide your conformance assessment following the exact output format specified.`;
}
