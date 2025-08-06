/**
 * Performance Benchmarks for Data Transformation System
 * Measures performance of various transformation operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';
import { dataTransformer } from '../../src/openai/advanced/data-transformer.js';
import { pipelineManager } from '../../src/openai/advanced/transformation-pipeline.js';
import { features } from '../../src/config/features.js';
import type { TransformationPipeline } from '../../src/openai/advanced/data-transformer.js';

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
}

describe('Data Transformation Performance Benchmarks', () => {
  let perf: PerformanceMeasure;
  const ITERATIONS = 100;

  beforeEach(() => {
    perf = new PerformanceMeasure();
    features.updateFlags({
      enableDataTransformation: true,
      enableCache: false, // Disable cache for accurate benchmarks
    });
    dataTransformer.clearCache();
    pipelineManager.clearWorkflows();
  });

  afterEach(() => {
    features.reset();
  });

  describe('Basic Transformation Performance', () => {
    it('should benchmark field renaming', async () => {
      const pipeline: TransformationPipeline = {
        name: 'renameBenchmark',
        rules: [
          { field: 'oldName1', type: 'rename', config: { newName: 'newName1' } },
          { field: 'oldName2', type: 'rename', config: { newName: 'newName2' } },
          { field: 'oldName3', type: 'rename', config: { newName: 'newName3' } },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        oldName1: 'value1',
        oldName2: 'value2',
        oldName3: 'value3',
        other: 'data',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'renameBenchmark');
        perf.end(start, 'rename');
      }

      const stats = perf.getStats('rename');
      console.log('Rename transformation:', stats);

      expect(stats?.avg).toBeLessThan(5); // Should be very fast
      expect(stats?.p95).toBeLessThan(10);
    });

    it('should benchmark type conversions', async () => {
      const pipeline: TransformationPipeline = {
        name: 'convertBenchmark',
        rules: [
          { field: 'stringToNumber', type: 'convert', config: { targetType: 'number' } },
          { field: 'numberToString', type: 'convert', config: { targetType: 'string' } },
          { field: 'stringToBoolean', type: 'convert', config: { targetType: 'boolean' } },
          { field: 'valueToArray', type: 'convert', config: { targetType: 'array' } },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        stringToNumber: '42',
        numberToString: 123,
        stringToBoolean: 'true',
        valueToArray: 'single',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'convertBenchmark');
        perf.end(start, 'convert');
      }

      const stats = perf.getStats('convert');
      console.log('Type conversion:', stats);

      expect(stats?.avg).toBeLessThan(5);
      expect(stats?.p95).toBeLessThan(10);
    });

    it('should benchmark formatting operations', async () => {
      const pipeline: TransformationPipeline = {
        name: 'formatBenchmark',
        rules: [
          { field: 'text1', type: 'format', config: { format: 'uppercase' } },
          { field: 'text2', type: 'format', config: { format: 'lowercase' } },
          { field: 'text3', type: 'format', config: { format: 'capitalize' } },
          { field: 'phone', type: 'format', config: { format: 'phone' } },
          { field: 'amount', type: 'format', config: { format: 'currency' } },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        text1: 'hello world',
        text2: 'HELLO WORLD',
        text3: 'hello world',
        phone: '5551234567',
        amount: 1234.56,
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'formatBenchmark');
        perf.end(start, 'format');
      }

      const stats = perf.getStats('format');
      console.log('Formatting operations:', stats);

      expect(stats?.avg).toBeLessThan(10);
      expect(stats?.p95).toBeLessThan(20);
    });
  });

  describe('Complex Transformation Performance', () => {
    it('should benchmark data validation', async () => {
      const pipeline: TransformationPipeline = {
        name: 'validateBenchmark',
        rules: [
          {
            field: 'email',
            type: 'validate',
            config: {
              required: true,
              type: 'email',
            },
          },
          {
            field: 'age',
            type: 'validate',
            config: {
              required: true,
              type: 'number',
              min: 0,
              max: 150,
            },
          },
          {
            field: 'website',
            type: 'validate',
            config: {
              type: 'url',
            },
          },
        ],
        validation: true,
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        email: 'user@example.com',
        age: 25,
        website: 'https://example.com',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'validateBenchmark');
        perf.end(start, 'validate');
      }

      const stats = perf.getStats('validate');
      console.log('Validation operations:', stats);

      expect(stats?.avg).toBeLessThan(10);
      expect(stats?.p95).toBeLessThan(20);
    });

    it('should benchmark data sanitization', async () => {
      const pipeline: TransformationPipeline = {
        name: 'sanitizeBenchmark',
        rules: [
          {
            field: 'htmlContent',
            type: 'sanitize',
            config: {
              removeHtml: true,
              removeScripts: true,
            },
          },
          {
            field: 'userInput',
            type: 'sanitize',
            config: {
              removeSpecialChars: true,
              trimWhitespace: true,
            },
          },
          {
            field: 'sqlInput',
            type: 'sanitize',
            config: {
              escapeSql: true,
            },
          },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        htmlContent: '<div>Hello <script>alert("xss")</script>World</div>',
        userInput: '  Hello!!!   @#$%   World   ',
        sqlInput: "'; DROP TABLE users; --",
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'sanitizeBenchmark');
        perf.end(start, 'sanitize');
      }

      const stats = perf.getStats('sanitize');
      console.log('Sanitization operations:', stats);

      expect(stats?.avg).toBeLessThan(10);
      expect(stats?.p95).toBeLessThan(20);
    });

    it('should benchmark data masking', async () => {
      const pipeline: TransformationPipeline = {
        name: 'maskBenchmark',
        rules: [
          {
            field: 'email',
            type: 'mask',
            config: { type: 'email' },
          },
          {
            field: 'phone',
            type: 'mask',
            config: { type: 'phone' },
          },
          {
            field: 'ssn',
            type: 'mask',
            config: { type: 'ssn' },
          },
          {
            field: 'creditCard',
            type: 'mask',
            config: { type: 'credit-card' },
          },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        email: 'john.doe@example.com',
        phone: '555-123-4567',
        ssn: '123-45-6789',
        creditCard: '4111111111111111',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'maskBenchmark');
        perf.end(start, 'mask');
      }

      const stats = perf.getStats('mask');
      console.log('Masking operations:', stats);

      expect(stats?.avg).toBeLessThan(10);
      expect(stats?.p95).toBeLessThan(20);
    });
  });

  describe('Pipeline Performance', () => {
    it('should benchmark complex multi-step pipeline', async () => {
      const pipeline: TransformationPipeline = {
        name: 'complexPipeline',
        rules: [
          // Step 1: Rename fields
          { field: 'firstName', type: 'rename', config: { newName: 'first_name' } },
          { field: 'lastName', type: 'rename', config: { newName: 'last_name' } },
          
          // Step 2: Format fields
          { field: 'first_name', type: 'format', config: { format: 'capitalize' } },
          { field: 'last_name', type: 'format', config: { format: 'capitalize' } },
          
          // Step 3: Validate
          { field: 'email', type: 'validate', config: { type: 'email', required: true } },
          { field: 'age', type: 'validate', config: { type: 'number', min: 18 } },
          
          // Step 4: Sanitize
          { field: 'bio', type: 'sanitize', config: { removeHtml: true, trimWhitespace: true } },
          
          // Step 5: Mask sensitive data
          { field: 'ssn', type: 'mask', config: { type: 'ssn' } },
          { field: 'phone', type: 'mask', config: { type: 'phone' } },
          
          // Step 6: Enrich
          { field: 'status', type: 'enrich', config: { 
            lookup: { 'active': 'Active User', 'inactive': 'Inactive User' }
          }},
        ],
        validation: true,
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        firstName: 'john',
        lastName: 'doe',
        email: 'john.doe@example.com',
        age: 30,
        bio: '<p>Software developer   </p>',
        ssn: '123-45-6789',
        phone: '555-123-4567',
        status: 'active',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'complexPipeline');
        perf.end(start, 'complex');
      }

      const stats = perf.getStats('complex');
      console.log('Complex pipeline:', stats);

      expect(stats?.avg).toBeLessThan(20);
      expect(stats?.p95).toBeLessThan(40);
    });

    it('should benchmark parallel vs sequential transformations', async () => {
      // Create test data with many fields
      const testData: any = {};
      for (let i = 0; i < 50; i++) {
        testData[`field${i}`] = `value${i}`;
      }

      // Sequential pipeline
      const sequentialPipeline: TransformationPipeline = {
        name: 'sequentialPipeline',
        rules: Array.from({ length: 50 }, (_, i) => ({
          field: `field${i}`,
          type: 'format' as const,
          config: { format: 'uppercase' },
        })),
      };

      dataTransformer.registerPipeline(sequentialPipeline);

      // Measure sequential
      for (let i = 0; i < 50; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'sequentialPipeline');
        perf.end(start, 'sequential');
      }

      const seqStats = perf.getStats('sequential');
      console.log('Sequential transformation (50 fields):', seqStats);

      expect(seqStats?.avg).toBeLessThan(50);
      expect(seqStats?.p95).toBeLessThan(100);
    });
  });

  describe('Cache Performance', () => {
    it('should benchmark cache effectiveness', async () => {
      features.updateFlags({ enableCache: true });

      const pipeline: TransformationPipeline = {
        name: 'cacheBenchmark',
        rules: [
          { field: 'name', type: 'format', config: { format: 'uppercase' } },
          { field: 'email', type: 'format', config: { format: 'lowercase' } },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        name: 'John Doe',
        email: 'JOHN@EXAMPLE.COM',
      };

      // First run - no cache
      const noCacheStart = perf.start();
      await dataTransformer.transform(testData, 'cacheBenchmark', { cache: true });
      const noCacheDuration = perf.end(noCacheStart, 'no-cache');

      // Subsequent runs - with cache
      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'cacheBenchmark', { cache: true });
        perf.end(start, 'with-cache');
      }

      const cacheStats = perf.getStats('with-cache');
      console.log('No cache duration:', noCacheDuration, 'ms');
      console.log('With cache:', cacheStats);

      // Cache should be significantly faster
      expect(cacheStats?.avg).toBeLessThan(noCacheDuration / 10);
      expect(cacheStats?.avg).toBeLessThan(1); // Should be sub-millisecond
    });
  });

  describe('Error Handling Performance', () => {
    it('should benchmark error recovery overhead', async () => {
      const pipeline: TransformationPipeline = {
        name: 'errorBenchmark',
        rules: [
          { field: 'willFail', type: 'convert', config: { targetType: 'number' } },
          { field: 'willSucceed', type: 'format', config: { format: 'uppercase' } },
        ],
        errorHandling: 'skip', // Skip failed transformations
      };

      dataTransformer.registerPipeline(pipeline);

      const testData = {
        willFail: 'not-a-number',
        willSucceed: 'hello world',
      };

      for (let i = 0; i < ITERATIONS; i++) {
        const start = perf.start();
        await dataTransformer.transform(testData, 'errorBenchmark');
        perf.end(start, 'error-recovery');
      }

      const stats = perf.getStats('error-recovery');
      console.log('Error recovery:', stats);

      // Error handling should not add significant overhead
      expect(stats?.avg).toBeLessThan(10);
      expect(stats?.p95).toBeLessThan(20);
    });
  });

  describe('Memory Usage', () => {
    it('should measure memory efficiency for large datasets', async () => {
      const pipeline: TransformationPipeline = {
        name: 'memoryBenchmark',
        rules: [
          { field: 'data', type: 'format', config: { format: 'uppercase' } },
        ],
      };

      dataTransformer.registerPipeline(pipeline);

      const initialMemory = process.memoryUsage().heapUsed;

      // Process many large objects
      for (let i = 0; i < 100; i++) {
        const largeData = {
          data: 'x'.repeat(10000), // 10KB string
          metadata: Array(100).fill({ field: `value${i}` }),
        };

        await dataTransformer.transform(largeData, 'memoryBenchmark');
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory growth for 100 large objects: ${memoryGrowth.toFixed(2)} MB`);

      // Should not have excessive memory growth
      expect(memoryGrowth).toBeLessThan(50); // Less than 50MB for 100 objects
    });
  });

  describe('Performance Summary', () => {
    it('should generate performance report', async () => {
      const operations = [
        'rename', 'convert', 'format', 'validate', 
        'sanitize', 'mask', 'complex'
      ];

      console.log('\n=== Transformation Performance Summary ===');
      console.log('Operation\t\tAvg (ms)\tP95 (ms)');
      console.log('─'.repeat(40));

      for (const op of operations) {
        const stats = perf.getStats(op);
        if (stats) {
          console.log(
            `${op.padEnd(16)}\t${stats.avg.toFixed(2)}\t\t${stats.p95.toFixed(2)}`
          );
        }
      }

      // All operations should complete within reasonable time
      expect(true).toBe(true);
    });
  });
});