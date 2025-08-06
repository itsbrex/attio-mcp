/**
 * Feature Isolation Tests
 * Ensures that advanced features don't affect behavior when disabled
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { features } from '../../src/config/features.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { searchCache, recordCache } from '../../src/openai/advanced/cache.js';
import { performanceMonitor } from '../../src/openai/advanced/performance.js';
import {
  searchCacheOptimized,
  recordCacheOptimized,
} from '../../src/openai/advanced/optimized-cache.js';

// Mock the tool dispatcher
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

describe('Feature Isolation Tests', () => {
  beforeEach(() => {
    // Reset everything to baseline
    features.reset();
    searchCache.clear();
    recordCache.clear();
    searchCacheOptimized.clear();
    recordCacheOptimized.clear();
    performanceMonitor.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Cache Feature Isolation', () => {
    it('should NOT use cache when disabled', async () => {
      features.updateFlags({ enableCache: false });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-no-cache' },
            values: { name: [{ value: 'No Cache Person' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResults);

      // Make same request 5 times
      for (let i = 0; i < 5; i++) {
        await search('nocache', 'people');
      }

      // Should call API every time (no caching)
      expect(executeToolRequest).toHaveBeenCalledTimes(5);

      // Cache should remain empty
      expect(searchCache.size()).toBe(0);
      expect(searchCacheOptimized.getStats().entries).toBe(0);
    });

    it('should NOT use cache for fetch when disabled', async () => {
      features.updateFlags({ enableCache: false });

      const mockResult = {
        data: {
          id: { person_id: 'person-fetch-no-cache' },
          values: { name: [{ value: 'Fetch No Cache' }] },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResult);

      // Fetch same ID multiple times
      await fetch('people:person-fetch-no-cache');
      await fetch('people:person-fetch-no-cache');
      await fetch('people:person-fetch-no-cache');

      // Should call API every time
      expect(executeToolRequest).toHaveBeenCalledTimes(3);

      // Record cache should be empty
      expect(recordCache.size()).toBe(0);
      expect(recordCacheOptimized.getStats().entries).toBe(0);
    });

    it('should verify cache is truly disabled in runtime', async () => {
      features.reset(); // All features off

      // Spy on cache methods
      const cacheSpy = vi.spyOn(searchCache, 'set');
      const cacheGetSpy = vi.spyOn(searchCache, 'get');

      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      await search('test', 'people');

      // Cache methods should not be called
      expect(cacheSpy).not.toHaveBeenCalled();
      expect(cacheGetSpy).toHaveBeenCalledTimes(1); // Called but returns null
      expect(cacheGetSpy).toHaveReturnedWith(undefined);
    });
  });

  describe('Relevance Scoring Isolation', () => {
    it('should NOT apply scoring when disabled', async () => {
      features.updateFlags({ enableRelevanceScoring: false });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-z' },
            values: { name: [{ value: 'Zachary Smith' }] }, // Would be low relevance
          },
          {
            id: { person_id: 'person-a' },
            values: { name: [{ value: 'John Smith' }] }, // Would be high relevance
          },
          {
            id: { person_id: 'person-m' },
            values: { name: [{ value: 'Michael Smith' }] }, // Would be medium relevance
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('John Smith', 'people');

      // Should maintain original order (no sorting by relevance)
      expect(results[0].title).toBe('Zachary Smith');
      expect(results[1].title).toBe('John Smith');
      expect(results[2].title).toBe('Michael Smith');

      // Should not have score property
      results.forEach((result) => {
        expect(result).not.toHaveProperty('score');
        expect(result).not.toHaveProperty('relevance');
      });
    });

    it('should verify scoring is not computed', async () => {
      features.reset();

      // Import scoring module to spy on it
      const { RelevanceScoring } = await import(
        '../../src/openai/advanced/scoring.js'
      );
      const scoringSpy = vi.spyOn(RelevanceScoring.prototype, 'calculateScore');

      vi.mocked(executeToolRequest).mockResolvedValue({
        data: [
          { id: { person_id: 'p1' }, values: { name: [{ value: 'Test' }] } },
        ],
      });

      await search('test', 'people');

      // Scoring should not be called
      expect(scoringSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling Isolation', () => {
    it('should NOT use advanced error handling when disabled', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: false });

      const error = new Error('API Error');
      vi.mocked(executeToolRequest)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      // Should fail immediately without retries
      await expect(search('test', 'people')).rejects.toThrow('API Error');

      // Should have only tried once (no retries)
      expect(executeToolRequest).toHaveBeenCalledTimes(1);
    });

    it('should verify error handler is bypassed', async () => {
      features.reset();

      // Import error handler to spy on it
      const { advancedErrorHandler } = await import(
        '../../src/openai/advanced/error-handler.js'
      );
      const errorSpy = vi.spyOn(advancedErrorHandler, 'executeWithRetry');

      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      await search('test', 'people');

      // Advanced error handler should not be called
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Data Transformation Isolation', () => {
    it('should NOT use advanced transformations when disabled', async () => {
      features.updateFlags({ enableDataTransformation: false });

      const mockData = {
        data: [
          {
            id: { person_id: 'person-transform' },
            values: {
              name: [{ value: 'Basic Transform' }],
              custom_field: [{ value: 'Should not be enhanced' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const results = await search('transform', 'people');

      // Should use basic transformation only
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('text');
      expect(results[0]).toHaveProperty('url');

      // Should not have enhanced properties
      expect(results[0]).not.toHaveProperty('enriched');
      expect(results[0]).not.toHaveProperty('normalized');
      expect(results[0]).not.toHaveProperty('metadata');
    });

    it('should verify transformer is not used', async () => {
      features.reset();

      // Import transformer to spy on it
      const { dataTransformer } = await import(
        '../../src/openai/advanced/data-transformer.js'
      );
      const transformSpy = vi.spyOn(dataTransformer, 'transform');

      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      await search('test', 'people');

      // Advanced transformer should not be called
      expect(transformSpy).not.toHaveBeenCalled();
    });
  });

  describe('Performance Optimization Isolation', () => {
    it('should NOT use performance optimizations when disabled', async () => {
      features.updateFlags({ enablePerformanceOptimization: false });

      const performanceSpy = vi.spyOn(performanceMonitor, 'startOperation');
      const endSpy = vi.spyOn(performanceMonitor, 'endOperation');

      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      await search('test', 'people');

      // Performance monitoring should not be active
      expect(performanceSpy).not.toHaveBeenCalled();
      expect(endSpy).not.toHaveBeenCalled();

      // Stats should be empty
      const stats = performanceMonitor.getAllStats();
      expect(Object.keys(stats)).toHaveLength(0);
    });

    it('should NOT use optimized cache when disabled', async () => {
      features.reset();

      const optimizedCacheSpy = vi.spyOn(searchCacheOptimized, 'get');
      const optimizedSetSpy = vi.spyOn(searchCacheOptimized, 'set');

      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      await search('test', 'people');

      // Optimized cache should not be used
      expect(optimizedCacheSpy).not.toHaveBeenCalled();
      expect(optimizedSetSpy).not.toHaveBeenCalled();
    });
  });

  describe('Complete Feature Isolation', () => {
    it('should behave identically with all features explicitly disabled', async () => {
      // Test 1: Everything explicitly disabled
      features.updateFlags({
        enableCache: false,
        enableRelevanceScoring: false,
        enableAdvancedErrorHandling: false,
        enableDataTransformation: false,
        enablePerformanceOptimization: false,
      });

      const mockData = {
        data: [
          {
            id: { person_id: 'p1' },
            values: { name: [{ value: 'Person 1' }] },
          },
          {
            id: { person_id: 'p2' },
            values: { name: [{ value: 'Person 2' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      const results1 = await search('test', 'people');

      // Test 2: Reset (implicitly disabled)
      features.reset();
      vi.clearAllMocks();
      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      const results2 = await search('test', 'people');

      // Results should be identical
      expect(results1).toEqual(results2);
    });

    it('should not leak feature state between tests', async () => {
      // Enable features
      features.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
      });

      expect(features.isEnabled('enableCache')).toBe(true);

      // Reset
      features.reset();

      // Verify all disabled
      expect(features.isEnabled('enableCache')).toBe(false);
      expect(features.isEnabled('enableRelevanceScoring')).toBe(false);
      expect(features.isEnabled('enableAdvancedErrorHandling')).toBe(false);
      expect(features.isEnabled('enableDataTransformation')).toBe(false);
      expect(features.isEnabled('enablePerformanceOptimization')).toBe(false);
    });

    it('should maintain baseline performance without features', async () => {
      features.reset();

      const mockData = {
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: { person_id: `p${i}` },
            values: { name: [{ value: `Person ${i}` }] },
          })),
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      const measurements: number[] = [];

      // Run multiple iterations
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await search('test', 'people');
        const duration = performance.now() - start;
        measurements.push(duration);
      }

      const avgDuration =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;

      // Should be fast without feature overhead
      expect(avgDuration).toBeLessThan(50); // 50ms threshold
    });
  });

  describe('Environment Variable Isolation', () => {
    it('should respect feature flags from environment', () => {
      // Simulate environment variables being set
      process.env.ENABLE_CACHE = 'false';
      process.env.ENABLE_RELEVANCE_SCORING = 'false';
      process.env.ENABLE_ADVANCED_ERROR_HANDLING = 'false';

      // Reset and re-read config
      features.reset();

      expect(features.isEnabled('enableCache')).toBe(false);
      expect(features.isEnabled('enableRelevanceScoring')).toBe(false);
      expect(features.isEnabled('enableAdvancedErrorHandling')).toBe(false);

      // Clean up
      delete process.env.ENABLE_CACHE;
      delete process.env.ENABLE_RELEVANCE_SCORING;
      delete process.env.ENABLE_ADVANCED_ERROR_HANDLING;
    });

    it('should default to disabled when env vars not set', () => {
      // Ensure no env vars
      delete process.env.ENABLE_CACHE;
      delete process.env.ENABLE_RELEVANCE_SCORING;
      delete process.env.ENABLE_ADVANCED_ERROR_HANDLING;
      delete process.env.ENABLE_DATA_TRANSFORMATION;
      delete process.env.ENABLE_PERFORMANCE_OPTIMIZATION;

      features.reset();

      // All should be disabled by default
      expect(features.isEnabled('enableCache')).toBe(false);
      expect(features.isEnabled('enableRelevanceScoring')).toBe(false);
      expect(features.isEnabled('enableAdvancedErrorHandling')).toBe(false);
      expect(features.isEnabled('enableDataTransformation')).toBe(false);
      expect(features.isEnabled('enablePerformanceOptimization')).toBe(false);
    });
  });
});
