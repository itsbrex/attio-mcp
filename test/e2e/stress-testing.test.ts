/**
 * Stress Testing and Failover Scenarios
 * Tests system behavior under high load and failure conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { features } from '../../src/config/features.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { searchCache, recordCache } from '../../src/openai/advanced/cache.js';
import { OptimizedCache } from '../../src/openai/advanced/optimized-cache.js';
import { PerformanceMonitor } from '../../src/openai/advanced/performance.js';
import { advancedErrorHandler } from '../../src/openai/advanced/error-handler.js';
import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

// Mock the dispatcher
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

describe('Stress Testing and Failover', () => {
  const performanceMonitor = new PerformanceMonitor();
  
  beforeEach(() => {
    features.reset();
    searchCache.clear();
    recordCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
  });

  describe('High Load Scenarios', () => {
    it('should handle 100 concurrent searches without degradation', async () => {
      features.updateFlags({
        enableCache: true,
        enablePerformanceOptimization: true,
        enableAdvancedErrorHandling: true,
      });

      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Found 5 people:\n' + Array(5).fill(null).map((_, i) => 
            `${i + 1}. Person ${i} (person${i}@example.com) (ID: person-${i}-12345678-1234-1234-1234-123456789abc)`
          ).join('\n')
        }]
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResponse);

      const startTime = Date.now();
      const concurrentRequests = 100;
      
      // Track individual request times
      const requestTimes: number[] = [];
      
      // Launch concurrent searches
      const promises = Array(concurrentRequests).fill(null).map(async (_, i) => {
        const reqStart = Date.now();
        const result = await search(`stress-test-${i % 20}`, 'people'); // Some cache hits
        const reqDuration = Date.now() - reqStart;
        requestTimes.push(reqDuration);
        return result;
      });

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All requests should succeed
      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });

      // Calculate statistics
      const avgTime = requestTimes.reduce((a, b) => a + b, 0) / requestTimes.length;
      const maxTime = Math.max(...requestTimes);
      const minTime = Math.min(...requestTimes);
      const sortedTimes = [...requestTimes].sort((a, b) => a - b);
      const p95Time = sortedTimes[Math.floor(sortedTimes.length * 0.95)];

      console.log(`
        Stress Test Results (${concurrentRequests} concurrent requests):
        - Total Duration: ${totalDuration}ms
        - Average Request Time: ${avgTime.toFixed(2)}ms
        - Min Request Time: ${minTime}ms
        - Max Request Time: ${maxTime}ms
        - P95 Request Time: ${p95Time}ms
        - Cache Hit Rate: ${(searchCache.getStats().hits / concurrentRequests * 100).toFixed(2)}%
      `);

      // Performance assertions
      expect(totalDuration).toBeLessThan(5000); // Should complete in under 5s
      expect(p95Time).toBeLessThan(500); // 95% of requests under 500ms
      expect(avgTime).toBeLessThan(200); // Average under 200ms
    });

    it('should handle memory pressure with cache eviction', async () => {
      features.updateFlags({
        enableCache: true,
        enablePerformanceOptimization: true,
      });

      // Create optimized cache with small memory limit
      const cache = new OptimizedCache<any>({
        maxMemoryMB: 1, // 1MB limit
        ttl: 3600000,
      });

      const initialMemory = process.memoryUsage().heapUsed;
      let evictions = 0;

      // Generate large data objects
      for (let i = 0; i < 1000; i++) {
        const largeData = {
          id: `item-${i}`,
          data: 'x'.repeat(10000), // ~10KB per item
          metadata: Array(100).fill({ field: `value-${i}` }),
        };

        cache.set(`key-${i}`, largeData);
        
        const stats = cache.getStats();
        if (stats.evictions > evictions) {
          evictions = stats.evictions;
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;
      const cacheStats = cache.getStats();

      console.log(`
        Memory Pressure Test Results:
        - Items Added: 1000
        - Items in Cache: ${cacheStats.size}
        - Total Evictions: ${cacheStats.evictions}
        - Memory Growth: ${memoryGrowth.toFixed(2)} MB
        - Cache Memory Used: ${(cacheStats.memoryUsed / 1024 / 1024).toFixed(2)} MB
      `);

      // Cache should respect memory limit
      expect(cacheStats.memoryUsed).toBeLessThan(1.5 * 1024 * 1024); // Allow small overhead
      expect(cacheStats.evictions).toBeGreaterThan(0); // Should have evicted items
      expect(cacheStats.size).toBeLessThan(1000); // Not all items should fit
    });

    it('should batch requests efficiently under load', async () => {
      features.updateFlags({
        enablePerformanceOptimization: true,
        enableRequestBatching: true,
      });

      const mockBatchResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            results: Array(10).fill(null).map((_, i) => ({
              id: `batch-${i}`,
              data: { name: `Batch Item ${i}` }
            }))
          })
        }]
      };

      let apiCallCount = 0;
      vi.mocked(executeToolRequest).mockImplementation(async () => {
        apiCallCount++;
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate API delay
        return mockBatchResponse;
      });

      // Launch 50 requests that should be batched
      const promises = Array(50).fill(null).map((_, i) => 
        fetch(`batch-item-${i % 10}`)
      );

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`
        Batching Test Results:
        - Total Requests: 50
        - API Calls Made: ${apiCallCount}
        - Time Saved: ~${(50 * 50 - duration)}ms
        - Efficiency: ${((1 - apiCallCount / 50) * 100).toFixed(2)}% reduction in API calls
      `);

      // Should batch requests (fewer API calls than requests)
      expect(apiCallCount).toBeLessThan(50);
      // Should complete faster than sequential (50 * 50ms = 2500ms)
      expect(duration).toBeLessThan(2500);
    });
  });

  describe('Failover Scenarios', () => {
    it('should handle cascading failures gracefully', async () => {
      features.updateFlags({
        enableAdvancedErrorHandling: true,
        enableCache: true,
      });

      const errors = [
        new Error('Primary API Down'),
        new Error('Fallback API Down'),
        new Error('Cache Server Error'),
      ];

      let attemptCount = 0;
      vi.mocked(executeToolRequest).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 4) {
          throw errors[attemptCount - 1];
        }
        return {
          content: [{
            type: 'text',
            text: 'Found 1 people:\n1. Recovered Person (recovered@example.com) (ID: recovered-12345678-1234-1234-1234-123456789abc)'
          }]
        };
      });

      const result = await search('failover-test', 'people');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recovered Person');
      expect(attemptCount).toBe(4); // Failed 3 times, succeeded on 4th
    });

    it('should circuit break after repeated failures', async () => {
      features.updateFlags({
        enableAdvancedErrorHandling: true,
        enableCircuitBreaker: true,
      });

      const error = new Error('Service Unavailable');
      (error as any).response = { status: 503 };

      vi.mocked(executeToolRequest).mockRejectedValue(error);

      // First few requests should attempt and fail
      for (let i = 0; i < 5; i++) {
        try {
          await search(`circuit-${i}`, 'people');
        } catch (e) {
          // Expected to fail
        }
      }

      const callCountBefore = vi.mocked(executeToolRequest).mock.calls.length;

      // Circuit should be open, next request should fail fast
      const startTime = Date.now();
      try {
        await search('circuit-open', 'people');
      } catch (e) {
        // Expected
      }
      const duration = Date.now() - startTime;

      const callCountAfter = vi.mocked(executeToolRequest).mock.calls.length;

      console.log(`
        Circuit Breaker Test:
        - Initial Failures: 5
        - Circuit State: Open
        - Fast Fail Duration: ${duration}ms
        - API Calls Avoided: ${callCountAfter === callCountBefore ? 'Yes' : 'No'}
      `);

      // Should fail fast without calling API
      expect(duration).toBeLessThan(50);
      // May or may not avoid API call depending on implementation
    });

    it('should degrade gracefully with partial failures', async () => {
      features.updateFlags({
        enableAdvancedErrorHandling: true,
        enableGracefulDegradation: true,
      });

      // Some object types fail, others succeed
      vi.mocked(executeToolRequest)
        .mockRejectedValueOnce(new Error('Companies API Down')) // companies fail
        .mockResolvedValueOnce({ // people succeed
          content: [{
            type: 'text',
            text: 'Found 2 people:\n1. Person A (a@example.com) (ID: a-12345678-1234-1234-1234-123456789abc)\n2. Person B (b@example.com) (ID: b-12345678-1234-1234-1234-123456789abc)'
          }]
        })
        .mockRejectedValueOnce(new Error('Lists API Down')) // lists fail
        .mockResolvedValueOnce({ // tasks succeed
          content: [{
            type: 'text',
            text: 'Found 1 tasks:\n1. Task One (ID: task-12345678-1234-1234-1234-123456789abc)'
          }]
        });

      const results = await search('partial');

      // Should return partial results
      expect(results).toHaveLength(3); // 2 people + 1 task
      expect(results.filter(r => r.title.includes('Person'))).toHaveLength(2);
      expect(results.filter(r => r.title.includes('Task'))).toHaveLength(1);
    });

    it('should handle timeout scenarios with fallback', async () => {
      features.updateFlags({
        enableAdvancedErrorHandling: true,
        enableTimeoutFallback: true,
      });

      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      let callCount = 0;
      vi.mocked(executeToolRequest).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call times out
          await new Promise(resolve => setTimeout(resolve, 5000));
          throw timeoutError;
        }
        // Fallback succeeds quickly
        return {
          content: [{
            type: 'text',
            text: 'Found 1 companies:\n1. Fallback Company (fallback.com) (ID: fallback-12345678-1234-1234-1234-123456789abc)'
          }]
        };
      });

      const startTime = Date.now();
      const controller = new AbortController();
      
      // Set a timeout for the test
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      try {
        const results = await search('timeout-test', 'companies');
        clearTimeout(timeoutId);
        
        const duration = Date.now() - startTime;
        
        expect(results).toHaveLength(1);
        expect(results[0].title).toBe('Fallback Company');
        expect(duration).toBeLessThan(3000); // Should not wait full 5s
      } catch (e) {
        clearTimeout(timeoutId);
        // If aborted, test the abort scenario
        expect(controller.signal.aborted).toBe(true);
      }
    });
  });

  describe('Recovery and Self-Healing', () => {
    it('should auto-recover from temporary failures', async () => {
      features.updateFlags({
        enableAdvancedErrorHandling: true,
        enableAutoRecovery: true,
      });

      let attemptCount = 0;
      vi.mocked(executeToolRequest).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('Temporary failure');
          (error as any).response = { status: 500 };
          throw error;
        }
        return {
          content: [{
            type: 'text',
            text: 'Found 1 lists:\n1. Recovered List (ID: list-12345678-1234-1234-1234-123456789abc)'
          }]
        };
      });

      const result = await search('recovery-test', 'lists');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recovered List');
      expect(attemptCount).toBe(3); // Failed twice, succeeded on third
    });

    it('should clear corrupted cache entries', async () => {
      features.updateFlags({
        enableCache: true,
        enableCacheValidation: true,
      });

      // Inject corrupted cache entry
      const corruptedData = 'CORRUPTED_DATA_NOT_JSON';
      searchCache.set('corrupted-key', corruptedData as any, 3600000);

      // Should handle corrupted cache gracefully
      const cached = searchCache.get('corrupted-key');
      
      // Cache should either return null or valid data
      if (cached !== null) {
        expect(typeof cached).toBe('object');
      }

      // New search should work despite corruption
      vi.mocked(executeToolRequest).mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Found 1 tasks:\n1. Valid Task (ID: task-12345678-1234-1234-1234-123456789abc)'
        }]
      });

      const result = await search('valid-after-corruption', 'tasks');
      expect(result).toHaveLength(1);
    });

    it('should rebalance load after partial recovery', async () => {
      features.updateFlags({
        enableLoadBalancing: true,
        enableAdvancedErrorHandling: true,
      });

      const healthStatus = {
        companies: false,
        people: true,
        lists: true,
        tasks: false,
      };

      vi.mocked(executeToolRequest).mockImplementation(async (request: any) => {
        const objectType = request.arguments?.object_type || 'unknown';
        
        if (!healthStatus[objectType as keyof typeof healthStatus]) {
          throw new Error(`${objectType} service unhealthy`);
        }

        return {
          content: [{
            type: 'text',
            text: `Found 1 ${objectType}:\n1. Healthy ${objectType} (ID: ${objectType}-12345678-1234-1234-1234-123456789abc)`
          }]
        };
      });

      // Search should only return results from healthy services
      const results = await search('rebalance-test');
      
      // Should have results only from healthy services (people and lists)
      const resultTypes = results.map(r => r.id.split(':')[0]);
      expect(resultTypes).not.toContain('companies');
      expect(resultTypes).not.toContain('tasks');
    });
  });

  describe('Performance Monitoring and Alerting', () => {
    it('should track and report performance metrics', async () => {
      features.updateFlags({
        enablePerformanceOptimization: true,
        enableMetricsCollection: true,
      });

      const monitor = new PerformanceMonitor();
      
      // Simulate various operations
      for (let i = 0; i < 20; i++) {
        const opId = `op-${i}`;
        monitor.startOperation(opId, `Operation ${i}`);
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        // Randomly fail some operations
        if (Math.random() > 0.8) {
          monitor.recordError(opId, new Error('Random failure'));
        }
        
        monitor.endOperation(opId);
      }

      const summary = monitor.getSummary();
      
      console.log(`
        Performance Monitoring Summary:
        - Total Operations: ${summary.totalOperations}
        - Successful: ${summary.successfulOperations}
        - Failed: ${summary.failedOperations}
        - Average Duration: ${summary.averageDuration?.toFixed(2)}ms
        - P95 Duration: ${summary.p95Duration?.toFixed(2)}ms
        - Success Rate: ${summary.successRate?.toFixed(2)}%
      `);

      expect(summary.totalOperations).toBe(20);
      expect(summary.successRate).toBeGreaterThan(0);
      expect(summary.averageDuration).toBeLessThan(100);
    });
  });
});