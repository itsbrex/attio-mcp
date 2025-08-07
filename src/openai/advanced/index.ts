/**
 * Advanced Components Index
 * Exports all advanced Phase 2 components
 */

export { AdvancedCache, searchCache, recordCache, attributeCache } from './cache.js';
export { RelevanceScorer, relevanceScorer } from './relevance-scorer.js';
export { 
  AdvancedErrorHandler, 
  advancedErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  type ErrorContext,
  type RecoveryStrategy 
} from './error-handler.js';
export {
  type ScoringAlgorithm,
  TFIDFScorer,
  BM25Scorer,
  SemanticScorer,
  HybridScorer,
  createScorer
} from './scoring-algorithms.js';
export {
  withErrorHandling,
  executeSearchWithFallback,
  executeFetchWithFallback,
  executeAttributeOperationWithFallback,
  configureCacheFallbacks
} from './error-recovery.js';
export {
  AdvancedDataTransformer,
  dataTransformer,
  type TransformationRule,
  type TransformationPipeline,
  type ValidationRule
} from './data-transformer.js';
export {
  TransformationPipelineManager,
  pipelineManager,
  standardWorkflows,
  type PipelineStage,
  type PipelineWorkflow
} from './transformation-pipeline.js';

// Re-export feature configuration for convenience
export { features, type FeatureFlags } from '../../config/features.js';