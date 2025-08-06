/**
 * Performance Benchmark Suite
 * Measures performance of various operations with and without advanced features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performance } from 'perf_hooks';
import { features } from '../../src/config/features.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { searchCache, recordCache } from '../../src/openai/advanced/cache.js';
import { advancedErrorHandler } from '../../src/openai/advanced/error-handler.js';
import { dataTransformer } from '../../src/openai/advanced/data-transformer.js';
import {
  transformToSearchResult,
  transformToFetchResult,
} from '../../src/openai/transformers/index.js';

// Mock the tool dispatcher for consistent results
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

/**
 * Performance measurement utility
 */
class PerformanceMeasure {
  private measurements: Map<string, number[]> = new Map();

  start(): number {
    return performance.now();
  }

  end(startTime: number, label: string): number {
    const duration = performance.now() - startTime;
    const existing = this.measurements.get(label) || [];
    existing.push(duration);
    this.measurements.set(label, existing);
    return duration;
  }

  getStats(label: string) {
    const times = this.measurements.get(label) || [];
    if (times.length === 0) return null;

    const sorted = [...times].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      count: times.length,
    };
  }

  clear() {
    this.measurements.clear();
  }

  report() {
    const report: Record<string, any> = {};
    for (const [label, _] of this.measurements) {
      report[label] = this.getStats(label);
    }
    return report;
  }
}

describe('Performance Benchmarks', () => {
  let perf: PerformanceMeasure;
  const ITERATIONS = 100;

  beforeEach(() => {
    perf = new PerformanceMeasure();
    features.reset();
    searchCache.clear();
    recordCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
  });

  describe('Search Performance', () => {
    const mockSearchResults = {
      data: Array(50)
        .fill(null)
        .map((_, i) => ({
          id: { person_id: `person-${i}` },
          values: {
            name: [{ value: `Person ${i}` }],
            email_addresses: [{ email_address: `person${i}@example.com` }],
            job_title: [{ value: `Title ${i}` }],
          },
        })),
    };

    it('should measure search performance without features', async () => {
      features.reset();
      vi.mocked(executeToolRequest).mockResolvedValue(mockSearchResults);

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await search(`query-${i}`, 'people');
        perf.end(start, 'search-no-features');
      }

      const stats = perf.getStats('search-no-features');
      console.log('Search without features:', stats);

      expect(stats?.avg).toBeLessThan(50); // Should be fast
      expect(stats?.p95).toBeLessThan(100);
    });

    it('should measure search performance with caching', async () => {
      features.updateFlags({ enableCache: true });
      vi.mocked(executeToolRequest).mockResolvedValue(mockSearchResults);

      // First run - populate cache
      for (let i = 0; i < 10; i++) {
        await search(`cached-${i}`, 'people');
      }

      // Measure cached performance
      for (let i = 0; i < ITERATIONS; i++) {
        const query = `cached-${i % 10}`; // Reuse cached queries
        const start = perf.start();
        await search(query, 'people');
        perf.end(start, 'search-with-cache');
      }

      const stats = perf.getStats('search-with-cache');
      console.log('Search with cache:', stats);

      expect(stats?.avg).toBeLessThan(10); // Cache should be very fast
      expect(stats?.p95).toBeLessThan(20);
    });

    it('should measure search performance with relevance scoring', async () => {
      features.updateFlags({ enableRelevanceScoring: true });
      vi.mocked(executeToolRequest).mockResolvedValue(mockSearchResults);

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await search(`query-${i}`, 'people');
        perf.end(start, 'search-with-scoring');
      }

      const stats = perf.getStats('search-with-scoring');
      console.log('Search with scoring:', stats);

      // Scoring adds overhead but should still be reasonable
      expect(stats?.avg).toBeLessThan(100);
      expect(stats?.p95).toBeLessThan(200);
    });

    it('should measure search performance with all features', async () => {
      features.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
        enableAdvancedErrorHandling: true,
        enableDataTransformation: true,
      });
      vi.mocked(executeToolRequest).mockResolvedValue(mockSearchResults);

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await search(`query-${i}`, 'people');
        perf.end(start, 'search-all-features');
      }

      const stats = perf.getStats('search-all-features');
      console.log('Search with all features:', stats);

      // All features combined should still be performant
      expect(stats?.avg).toBeLessThan(150);
      expect(stats?.p95).toBeLessThan(300);
    });
  });

  describe('Fetch Performance', () => {
    const mockFetchResult = {
      data: {
        id: { person_id: 'person-test' },
        values: {
          name: [{ value: 'Test Person' }],
          email_addresses: [{ email_address: 'test@example.com' }],
          phone_numbers: [{ phone_number: '+1234567890' }],
          job_title: [{ value: 'Software Engineer' }],
          company: [{ value: 'Test Corp' }],
        },
      },
    };

    it('should measure fetch performance without features', async () => {
      features.reset();
      vi.mocked(executeToolRequest).mockResolvedValue(mockFetchResult);

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await fetch(`people:person-${i}`);
        perf.end(start, 'fetch-no-features');
      }

      const stats = perf.getStats('fetch-no-features');
      console.log('Fetch without features:', stats);

      expect(stats?.avg).toBeLessThan(20);
      expect(stats?.p95).toBeLessThan(50);
    });

    it('should measure fetch performance with caching', async () => {
      features.updateFlags({ enableCache: true });
      vi.mocked(executeToolRequest).mockResolvedValue(mockFetchResult);

      // Warm up cache
      for (let i = 0; i < 10; i++) {
        await fetch(`people:cached-${i}`);
      }

      // Measure cached fetches
      for (let i = 0; i < ITERATIONS; i++) {
        const id = `people:cached-${i % 10}`;
        const start = perf.start();
        await fetch(id);
        perf.end(start, 'fetch-with-cache');
      }

      const stats = perf.getStats('fetch-with-cache');
      console.log('Fetch with cache:', stats);

      expect(stats?.avg).toBeLessThan(5);
      expect(stats?.p95).toBeLessThan(10);
    });
  });

  describe('Transformation Performance', () => {
    const createMockRecord = (i: number) => ({
      id: { person_id: `person-${i}` },
      values: {
        name: [{ value: `Person ${i}` }],
        email_addresses: [{ email_address: `person${i}@example.com` }],
        phone_numbers: [{ phone_number: `+123456${i}` }],
        job_title: [{ value: `Title ${i}` }],
      },
    });

    it('should measure basic transformation performance', () => {
      const records = Array(100)
        .fill(null)
        .map((_, i) => createMockRecord(i));

      for (const record of records) {
        const start = perf.start();
        transformToSearchResult(record, 'test', 'people');
        perf.end(start, 'transform-basic');
      }

      const stats = perf.getStats('transform-basic');
      console.log('Basic transformation:', stats);

      expect(stats?.avg).toBeLessThan(1);
      expect(stats?.p95).toBeLessThan(2);
    });

    it('should measure enhanced transformation performance', async () => {
      features.updateFlags({ enableDataTransformation: true });

      // Register a simple pipeline
      dataTransformer.registerPipeline('test', {
        name: 'test',
        stages: [
          {
            name: 'enrich',
            operation: 'enrich',
            config: { fields: { category: 'test' } },
          },
        ],
      });

      const records = Array(100)
        .fill(null)
        .map((_, i) => createMockRecord(i));

      for (const record of records) {
        const start = perf.start();
        await dataTransformer.transform(record, 'test');
        perf.end(start, 'transform-enhanced');
      }

      const stats = perf.getStats('transform-enhanced');
      console.log('Enhanced transformation:', stats);

      expect(stats?.avg).toBeLessThan(5);
      expect(stats?.p95).toBeLessThan(10);
    });
  });

  describe('Cache Performance', () => {
    it('should measure cache set/get performance', () => {
      const data = { id: 'test', data: 'x'.repeat(1000) };

      // Measure set performance
      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        searchCache.set(`key-${i}`, data, 3600000);
        perf.end(start, 'cache-set');
      }

      // Measure get performance
      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        searchCache.get(`key-${i}`);
        perf.end(start, 'cache-get');
      }

      const setStats = perf.getStats('cache-set');
      const getStats = perf.getStats('cache-get');

      console.log('Cache set:', setStats);
      console.log('Cache get:', getStats);

      expect(setStats?.avg).toBeLessThan(1);
      expect(getStats?.avg).toBeLessThan(0.5);
    });

    it('should measure cache memory efficiency', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Add 1000 cached items
      for (let i = 0; i < 1000; i++) {
        const data = {
          id: `item-${i}`,
          data: `Data ${i}`.repeat(100),
        };
        searchCache.set(`large-${i}`, data, 3600000);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(
        `Cache memory usage for 1000 items: ${memoryIncrease.toFixed(2)} MB`
      );

      // Should use reasonable memory (less than 50MB for 1000 items)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  describe('Error Handling Performance', () => {
    it('should measure error handling overhead', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: true });

      const operation = async () => {
        throw new Error('Test error');
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        try {
          await advancedErrorHandler.executeWithRetry(operation, {
            maxRetries: 0,
          });
        } catch (e) {
          // Expected
        }
        perf.end(start, 'error-handling');
      }

      const stats = perf.getStats('error-handling');
      console.log('Error handling:', stats);

      expect(stats?.avg).toBeLessThan(5);
      expect(stats?.p95).toBeLessThan(10);
    });
  });

  describe('Performance Comparison', () => {
    it('should generate performance comparison report', async () => {
      const mockResults = {
        data: Array(20)
          .fill(null)
          .map((_, i) => ({
            id: { person_id: `person-${i}` },
            values: {
              name: [{ value: `Person ${i}` }],
              email_addresses: [{ email_address: `person${i}@example.com` }],
            },
          })),
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResults);

      // Test without features
      features.reset();
      for (let i = 0; i < 50; i++) {
        const start = perf.start();
        await search('test', 'people');
        perf.end(start, 'baseline');
      }

      // Test with all features
      features.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
        enableAdvancedErrorHandling: true,
        enableDataTransformation: true,
      });

      for (let i = 0; i < 50; i++) {
        const start = perf.start();
        await search('test', 'people');
        perf.end(start, 'enhanced');
      }

      const baseline = perf.getStats('baseline');
      const enhanced = perf.getStats('enhanced');

      console.log('\n=== Performance Comparison ===');
      console.log('Baseline (no features):', baseline);
      console.log('Enhanced (all features):', enhanced);

      if (baseline && enhanced) {
        const overhead = ((enhanced.avg - baseline.avg) / baseline.avg) * 100;
        console.log(`Average overhead: ${overhead.toFixed(2)}%`);

        // Enhanced version should not be more than 3x slower
        expect(enhanced.avg).toBeLessThan(baseline.avg * 3);
      }
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory with repeated operations', async () => {
      vi.mocked(executeToolRequest).mockResolvedValue({ data: [] });

      const initialMemory = process.memoryUsage().heapUsed;

      // Run many operations
      for (let i = 0; i < 1000; i++) {
        await search(`query-${i}`, 'people');

        // Clear cache periodically to avoid legitimate memory growth
        if (i % 100 === 0) {
          searchCache.clear();
          recordCache.clear();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(
        `Memory growth after 1000 operations: ${memoryGrowth.toFixed(2)} MB`
      );

      // Should not grow more than 10MB
      expect(Math.abs(memoryGrowth)).toBeLessThan(10);
    });
  });
});
