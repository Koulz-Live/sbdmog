// packages/ai/src/index.ts

export { openai, DEFAULT_MODEL } from './client.js';
export * from './services/summarise.js';
export * from './services/draftReport.js';
export * from './prompts/incidentSummary.js';
export * from './prompts/rcaDraft.js';
export * from './prompts/changeRiskAssessment.js';
export * from './prompts/monthlyReportDraft.js';
export * from './prompts/documentationAssist.js';
export * from './prompts/governanceInsights.js';
export * from './services/governanceInsights.js';
export * from './prompts/etlAnalysis.js';
export * from './services/etlAnalysis.js';
