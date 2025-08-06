/**
 * Unit tests for feature configuration system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FeatureConfiguration,
  defaultFeatureFlags,
} from '../../src/config/features.js';

describe('Feature Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let featureConfig: FeatureConfiguration;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear any cached instance
    (FeatureConfiguration as any).instance = undefined;

    // Get fresh instance
    featureConfig = FeatureConfiguration.getInstance();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clear cached instance
    (FeatureConfiguration as any).instance = undefined;
  });

  describe('Default Configuration', () => {
    it('should initialize with all features disabled by default', () => {
      const flags = featureConfig.getFlags();

      expect(flags.enableCache).toBe(false);
      expect(flags.enableRelevanceScoring).toBe(false);
      expect(flags.enableAdvancedErrorHandling).toBe(false);
      expect(flags.enableSSEIntegration).toBe(false);
      expect(flags.enableDataTransformation).toBe(false);
      expect(flags.enablePerformanceOptimization).toBe(false);
      expect(flags.enableEnhancedLogging).toBe(false);
      expect(flags.enableRateLimitingEnhancements).toBe(false);
    });

    it('should match default feature flags', () => {
      const flags = featureConfig.getFlags();
      expect(flags).toEqual(defaultFeatureFlags);
    });
  });

  describe('Environment Variable Loading', () => {
    it('should enable cache when environment variable is set', () => {
      process.env.ATTIO_ENABLE_CACHE = 'true';

      // Create new instance to pick up env changes
      (FeatureConfiguration as any).instance = undefined;
      featureConfig = FeatureConfiguration.getInstance();

      expect(featureConfig.isEnabled('enableCache')).toBe(true);
      expect(featureConfig.isEnabled('enableRelevanceScoring')).toBe(false);
    });

    it('should enable multiple features from environment', () => {
      process.env.ATTIO_ENABLE_CACHE = 'true';
      process.env.ATTIO_ENABLE_RELEVANCE_SCORING = 'true';
      process.env.ATTIO_ENABLE_SSE_INTEGRATION = 'true';

      (FeatureConfiguration as any).instance = undefined;
      featureConfig = FeatureConfiguration.getInstance();

      const flags = featureConfig.getFlags();
      expect(flags.enableCache).toBe(true);
      expect(flags.enableRelevanceScoring).toBe(true);
      expect(flags.enableSSEIntegration).toBe(true);
      expect(flags.enableAdvancedErrorHandling).toBe(false);
    });

    it('should not enable features with non-true values', () => {
      process.env.ATTIO_ENABLE_CACHE = 'false';
      process.env.ATTIO_ENABLE_RELEVANCE_SCORING = '1';
      process.env.ATTIO_ENABLE_SSE_INTEGRATION = 'yes';

      (FeatureConfiguration as any).instance = undefined;
      featureConfig = FeatureConfiguration.getInstance();

      const flags = featureConfig.getFlags();
      expect(flags.enableCache).toBe(false);
      expect(flags.enableRelevanceScoring).toBe(false);
      expect(flags.enableSSEIntegration).toBe(false);
    });
  });

  describe('Feature Checking', () => {
    it('should correctly check if features are enabled', () => {
      featureConfig.updateFlags({ enableCache: true });

      expect(featureConfig.isEnabled('enableCache')).toBe(true);
      expect(featureConfig.isEnabled('enableRelevanceScoring')).toBe(false);
    });

    it('should handle all feature flags', () => {
      const allFeatures: Array<keyof typeof defaultFeatureFlags> = [
        'enableCache',
        'enableRelevanceScoring',
        'enableAdvancedErrorHandling',
        'enableSSEIntegration',
        'enableDataTransformation',
        'enablePerformanceOptimization',
        'enableEnhancedLogging',
        'enableRateLimitingEnhancements',
      ];

      for (const feature of allFeatures) {
        expect(featureConfig.isEnabled(feature)).toBe(false);
      }
    });
  });

  describe('Runtime Updates', () => {
    it('should allow updating flags at runtime', () => {
      expect(featureConfig.isEnabled('enableCache')).toBe(false);

      featureConfig.updateFlags({ enableCache: true });

      expect(featureConfig.isEnabled('enableCache')).toBe(true);
    });

    it('should allow partial updates', () => {
      featureConfig.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
      });

      const flags = featureConfig.getFlags();
      expect(flags.enableCache).toBe(true);
      expect(flags.enableRelevanceScoring).toBe(true);
      expect(flags.enableSSEIntegration).toBe(false);
    });

    it('should reset to defaults', () => {
      featureConfig.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
        enableSSEIntegration: true,
      });

      featureConfig.reset();

      const flags = featureConfig.getFlags();
      expect(flags).toEqual(defaultFeatureFlags);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = FeatureConfiguration.getInstance();
      const instance2 = FeatureConfiguration.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should preserve state across getInstance calls', () => {
      const instance1 = FeatureConfiguration.getInstance();
      instance1.updateFlags({ enableCache: true });

      const instance2 = FeatureConfiguration.getInstance();
      expect(instance2.isEnabled('enableCache')).toBe(true);
    });
  });

  describe('Enhanced Logging', () => {
    it('should log when enhanced logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      process.env.ATTIO_ENABLE_ENHANCED_LOGGING = 'true';
      (FeatureConfiguration as any).instance = undefined;
      featureConfig = FeatureConfiguration.getInstance();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FeatureConfiguration] Loaded feature flags:'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should not log when enhanced logging is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      process.env.ATTIO_ENABLE_ENHANCED_LOGGING = 'false';
      (FeatureConfiguration as any).instance = undefined;
      featureConfig = FeatureConfiguration.getInstance();

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

describe('Backward Compatibility', () => {
  it('should not affect existing functionality when all features disabled', () => {
    const featureConfig = FeatureConfiguration.getInstance();
    const flags = featureConfig.getFlags();

    // Verify all features are disabled
    for (const [key, value] of Object.entries(flags)) {
      expect(value).toBe(false);
    }
  });
});
