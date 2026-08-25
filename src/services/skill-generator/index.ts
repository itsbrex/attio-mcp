/**
 * Workspace Schema Skill Generator
 *
 * Exports services and types for generating Claude Skills from Attio workspace schemas.
 *
 * @see Issue #983
 */

export { WorkspaceSchemaService } from './WorkspaceSchemaService.js';
export { SchemaFormatterService } from './SchemaFormatterService.js';
export { OutputWriterService } from './OutputWriterService.js';
export {
  computeSchemaHash,
  extractSchemaHash,
  compareSchemaToSkill,
} from './drift.js';
export type { DriftReport } from './drift.js';
export {
  DEFAULT_CONCURRENCY,
  mapWithConcurrency,
  withRateLimitRetry,
  isRateLimitError,
} from './concurrency.js';
export {
  buildSkillArchive,
  bundleBaseName,
  writeWebBundles,
} from './bundler.js';
export type { BundleOptions, BundleResult } from './bundler.js';
export { installToAllAgents } from './agent-installer.js';
export type { AgentInstallResult } from './agent-installer.js';
export type {
  GenerateSkillConfig,
  WorkspaceSchema,
  ObjectSchema,
  AttributeSchema,
  AttributeOption,
  FormattedOutput,
  SkillOutput,
  FetchSchemaOptions,
  ListSchema,
} from './types.js';
