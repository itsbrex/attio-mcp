/**
 * Feature Flag Configuration System
 * Controls the availability of advanced Phase 2 features
 * All features are disabled by default to maintain backward compatibility
 */

export interface FeatureFlags {
  // Caching system with TTL support
  enableCache: boolean;

  // Relevance scoring algorithm for search results
  enableRelevanceScoring: boolean;

  // Advanced error handling with categorization and recovery
  enableAdvancedErrorHandling: boolean;

  // SSE (Server-Sent Events) integration
  enableSSEIntegration: boolean;

  // Advanced data transformation pipelines
  enableDataTransformation: boolean;

  // Performance optimization features
  enablePerformanceOptimization: boolean;

  // Enhanced logging and telemetry
  enableEnhancedLogging: boolean;

  // Rate limiting enhancements
  enableRateLimitingEnhancements: boolean;
}

/**
 * Default feature configuration
 * All features disabled by default for backward compatibility
 */
export const defaultFeatureFlags: FeatureFlags = {
  enableCache: false,
  enableRelevanceScoring: false,
  enableAdvancedErrorHandling: false,
  enableSSEIntegration: false,
  enableDataTransformation: false,
  enablePerformanceOptimization: false,
  enableEnhancedLogging: false,
  enableRateLimitingEnhancements: false,
};

/**
 * Feature configuration loader
 * Loads feature flags from environment variables or configuration file
 */
export class FeatureConfiguration {
  private static instance: FeatureConfiguration;
  private flags: FeatureFlags;

  private constructor() {
    this.flags = this.loadFeatureFlags();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): FeatureConfiguration {
    if (!FeatureConfiguration.instance) {
      FeatureConfiguration.instance = new FeatureConfiguration();
    }
    return FeatureConfiguration.instance;
  }

  /**
   * Load feature flags from environment or use defaults
   */
  private loadFeatureFlags(): FeatureFlags {
    const flags: FeatureFlags = { ...defaultFeatureFlags };

    // Load from environment variables if available
    if (process.env.ATTIO_ENABLE_CACHE === 'true') {
      flags.enableCache = true;
    }

    if (process.env.ATTIO_ENABLE_RELEVANCE_SCORING === 'true') {
      flags.enableRelevanceScoring = true;
    }

    if (process.env.ATTIO_ENABLE_ADVANCED_ERROR_HANDLING === 'true') {
      flags.enableAdvancedErrorHandling = true;
    }

    if (process.env.ATTIO_ENABLE_SSE_INTEGRATION === 'true') {
      flags.enableSSEIntegration = true;
    }

    if (process.env.ATTIO_ENABLE_DATA_TRANSFORMATION === 'true') {
      flags.enableDataTransformation = true;
    }

    if (process.env.ATTIO_ENABLE_PERFORMANCE_OPTIMIZATION === 'true') {
      flags.enablePerformanceOptimization = true;
    }

    if (process.env.ATTIO_ENABLE_ENHANCED_LOGGING === 'true') {
      flags.enableEnhancedLogging = true;
    }

    if (process.env.ATTIO_ENABLE_RATE_LIMITING_ENHANCEMENTS === 'true') {
      flags.enableRateLimitingEnhancements = true;
    }

    // Log feature flag status if enhanced logging is enabled
    if (flags.enableEnhancedLogging) {
      console.log('[FeatureConfiguration] Loaded feature flags:', flags);
    }

    return flags;
  }

  /**
   * Get current feature flags
   */
  public getFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Check if a specific feature is enabled
   */
  public isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags[feature];
  }

  /**
   * Update feature flags (for testing purposes)
   */
  public updateFlags(updates: Partial<FeatureFlags>): void {
    this.flags = { ...this.flags, ...updates };
  }

  /**
   * Reset to default flags
   */
  public reset(): void {
    this.flags = { ...defaultFeatureFlags };
  }
}

/**
 * Export singleton instance for convenience
 */
export const features = FeatureConfiguration.getInstance();
