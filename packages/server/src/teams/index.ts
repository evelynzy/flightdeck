/**
 * Teams module barrel export.
 */
export {
  BUNDLE_FORMAT_VERSION,
  computeChecksum,
  createManifest,
  validateManifest,
  verifyChecksum,
} from './bundle-format.js';
export type {
  BundleManifest,
  BundleStats,
  AgentExport,
  AgentExportStats,
  KnowledgeCategory,
  KnowledgeExport,
  CorrectionExport,
  FeedbackExport,
  TeamBundle,
  ExportOptions,
} from './bundle-format.js';

export { TeamExporter } from './TeamExporter.js';
export type { TeamExporterDeps, ExportResult } from './TeamExporter.js';
