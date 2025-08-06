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

// Re-export feature configuration for convenience
export { features, type FeatureFlags } from '../../config/features.js';