/**
 * Scoring Configuration Module
 * Manages relevance scoring settings and algorithm selection
 */

import { ScoringAlgorithm, relevanceScorer } from '../openai/advanced/index.js';
import { features } from './features.js';

export interface ScoringConfig {
  algorithm: ScoringAlgorithm;
  fieldWeights?: Record<string, number>;
  factorWeights?: {
    textMatch?: number;
    recency?: number;
    completeness?: number;
    engagement?: number;
  };
  algorithmConfig?: {
    // BM25 parameters
    k1?: number;
    b?: number;
    // Hybrid weights
    weights?: {
      tfidf?: number;
      bm25?: number;
      semantic?: number;
    };
  };
}

/**
 * Default scoring configuration
 */
export const defaultScoringConfig: ScoringConfig = {
  algorithm: 'hybrid',
  fieldWeights: {
    name: 1.0,
    title: 0.9,
    description: 0.7,
    notes: 0.5,
    tags: 0.6,
    email: 0.8,
    phone: 0.6,
    company: 0.7,
  },
  factorWeights: {
    textMatch: 0.4,
    recency: 0.2,
    completeness: 0.2,
    engagement: 0.2,
  },
  algorithmConfig: {
    k1: 1.2,
    b: 0.75,
    weights: {
      tfidf: 0.3,
      bm25: 0.5,
      semantic: 0.2,
    },
  },
};

/**
 * Scoring configuration manager
 */
export class ScoringConfigManager {
  private static instance: ScoringConfigManager;
  private config: ScoringConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.applyConfig();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ScoringConfigManager {
    if (!ScoringConfigManager.instance) {
      ScoringConfigManager.instance = new ScoringConfigManager();
    }
    return ScoringConfigManager.instance;
  }

  /**
   * Load configuration from environment or defaults
   */
  private loadConfig(): ScoringConfig {
    const config = { ...defaultScoringConfig };

    // Load algorithm from environment
    const envAlgorithm = process.env.ATTIO_SCORING_ALGORITHM;
    if (envAlgorithm && ['tfidf', 'bm25', 'semantic', 'hybrid'].includes(envAlgorithm)) {
      config.algorithm = envAlgorithm as ScoringAlgorithm;
    }

    // Load BM25 parameters from environment
    if (process.env.ATTIO_BM25_K1) {
      config.algorithmConfig = config.algorithmConfig || {};
      config.algorithmConfig.k1 = parseFloat(process.env.ATTIO_BM25_K1);
    }
    if (process.env.ATTIO_BM25_B) {
      config.algorithmConfig = config.algorithmConfig || {};
      config.algorithmConfig.b = parseFloat(process.env.ATTIO_BM25_B);
    }

    return config;
  }

  /**
   * Apply configuration to relevance scorer
   */
  private applyConfig(): void {
    if (!features.isEnabled('enableRelevanceScoring')) {
      return;
    }

    // Set algorithm
    relevanceScorer.setAlgorithm(this.config.algorithm);

    // Update field weights
    if (this.config.fieldWeights) {
      relevanceScorer.updateFieldWeights(this.config.fieldWeights);
    }

    // Update factor weights
    if (this.config.factorWeights) {
      relevanceScorer.updateFactorWeights(this.config.factorWeights);
    }

    // Configure algorithm-specific parameters
    if (this.config.algorithmConfig) {
      relevanceScorer.configureAlgorithm(this.config.algorithmConfig);
    }

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[ScoringConfig] Applied scoring configuration:', {
        algorithm: this.config.algorithm,
        fieldWeights: Object.keys(this.config.fieldWeights || {}),
        algorithmConfig: this.config.algorithmConfig,
      });
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): ScoringConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<ScoringConfig>): void {
    this.config = { ...this.config, ...updates };
    this.applyConfig();
  }

  /**
   * Set scoring algorithm
   */
  public setAlgorithm(algorithm: ScoringAlgorithm): void {
    this.config.algorithm = algorithm;
    relevanceScorer.setAlgorithm(algorithm);
    
    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(`[ScoringConfig] Changed algorithm to: ${algorithm}`);
    }
  }

  /**
   * Get algorithm performance metrics
   */
  public getPerformanceMetrics(): Record<string, any> {
    return {
      algorithm: this.config.algorithm,
      enabled: features.isEnabled('enableRelevanceScoring'),
      // Additional metrics could be added here
    };
  }

  /**
   * Reset to default configuration
   */
  public reset(): void {
    this.config = { ...defaultScoringConfig };
    this.applyConfig();
  }
}

// Export singleton instance
export const scoringConfig = ScoringConfigManager.getInstance();