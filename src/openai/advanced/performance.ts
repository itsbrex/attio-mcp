/**
 * Performance Optimization Module
 * Provides performance monitoring and optimization utilities
 */

import { features } from '../../config/features.js';
import { debug } from '../../utils/logger.js';

export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsed?: number;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface PerformanceThresholds {
  warningMs: number;
  criticalMs: number;
  maxMemoryMB: number;
}

/**
 * Performance monitor for tracking operation metrics
 */
export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private activeOperations: Map<string, PerformanceMetrics> = new Map();
  private thresholds: Map<string, PerformanceThresholds> = new Map();

  constructor() {
    this.setupDefaultThresholds();
  }

  /**
   * Set up default performance thresholds
   */
  private setupDefaultThresholds(): void {
    this.thresholds.set('search', {
      warningMs: 100,
      criticalMs: 500,
      maxMemoryMB: 50,
    });

    this.thresholds.set('fetch', {
      warningMs: 50,
      criticalMs: 200,
      maxMemoryMB: 20,
    });

    this.thresholds.set('transform', {
      warningMs: 10,
      criticalMs: 50,
      maxMemoryMB: 10,
    });

    this.thresholds.set('cache', {
      warningMs: 5,
      criticalMs: 20,
      maxMemoryMB: 100,
    });
  }

  /**
   * Start tracking an operation
   */
  public startOperation(
    operationId: string,
    operationName: string,
    metadata?: Record<string, any>
  ): void {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      return;
    }

    const metric: PerformanceMetrics = {
      operationName,
      startTime: performance.now(),
      success: false,
      metadata,
      memoryUsed: process.memoryUsage().heapUsed,
    };

    this.activeOperations.set(operationId, metric);
  }

  /**
   * End tracking an operation
   */
  public endOperation(operationId: string, success: boolean = true): PerformanceMetrics | null {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      return null;
    }

    const metric = this.activeOperations.get(operationId);
    if (!metric) {
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;

    const currentMemory = process.memoryUsage().heapUsed;
    metric.memoryUsed = (currentMemory - (metric.memoryUsed || 0)) / 1024 / 1024; // MB

    this.activeOperations.delete(operationId);
    this.recordMetric(metric);
    this.checkThresholds(metric);

    return metric;
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    const metrics = this.metrics.get(metric.operationName) || [];
    metrics.push(metric);

    // Keep only last 1000 metrics per operation
    if (metrics.length > 1000) {
      metrics.shift();
    }

    this.metrics.set(metric.operationName, metrics);
  }

  /**
   * Check if metric exceeds thresholds
   */
  private checkThresholds(metric: PerformanceMetrics): void {
    const threshold = this.thresholds.get(metric.operationName);
    if (!threshold || !metric.duration) {
      return;
    }

    if (metric.duration > threshold.criticalMs) {
      debug(
        'PerformanceMonitor',
        `CRITICAL: Operation ${metric.operationName} took ${metric.duration.toFixed(2)}ms`,
        metric,
        'performance'
      );
    } else if (metric.duration > threshold.warningMs) {
      debug(
        'PerformanceMonitor',
        `WARNING: Operation ${metric.operationName} took ${metric.duration.toFixed(2)}ms`,
        metric,
        'performance'
      );
    }

    if (metric.memoryUsed && metric.memoryUsed > threshold.maxMemoryMB) {
      debug(
        'PerformanceMonitor',
        `MEMORY WARNING: Operation ${metric.operationName} used ${metric.memoryUsed.toFixed(2)}MB`,
        metric,
        'performance'
      );
    }
  }

  /**
   * Get statistics for an operation
   */
  public getStats(operationName: string): Record<string, any> | null {
    const metrics = this.metrics.get(operationName);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    const durations = metrics
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);

    if (durations.length === 0) {
      return null;
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const successCount = metrics.filter(m => m.success).length;

    return {
      count: metrics.length,
      successRate: (successCount / metrics.length) * 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all statistics
   */
  public getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [operation, _] of this.metrics) {
      stats[operation] = this.getStats(operation);
    }

    return stats;
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics.clear();
    this.activeOperations.clear();
  }

  /**
   * Set custom threshold for an operation
   */
  public setThreshold(
    operationName: string,
    threshold: PerformanceThresholds
  ): void {
    this.thresholds.set(operationName, threshold);
  }
}

/**
 * Request batching for improved performance
 */
export class RequestBatcher<T, R> {
  private batch: Map<string, { request: T; resolve: (value: R) => void; reject: (error: any) => void }[]> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private batchSize: number;
  private batchDelay: number;
  private processor: (requests: T[]) => Promise<R[]>;

  constructor(
    processor: (requests: T[]) => Promise<R[]>,
    batchSize: number = 10,
    batchDelay: number = 10
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.batchDelay = batchDelay;
  }

  /**
   * Add a request to the batch
   */
  public async add(key: string, request: T): Promise<R> {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      // Process immediately without batching
      const results = await this.processor([request]);
      return results[0];
    }

    return new Promise((resolve, reject) => {
      const requests = this.batch.get(key) || [];
      requests.push({ request, resolve, reject });
      this.batch.set(key, requests);

      if (requests.length >= this.batchSize) {
        this.processBatch(key);
      } else {
        this.scheduleProcessing(key);
      }
    });
  }

  /**
   * Schedule batch processing
   */
  private scheduleProcessing(key: string): void {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.processBatch(key);
    }, this.batchDelay);
  }

  /**
   * Process a batch of requests
   */
  private async processBatch(key: string): Promise<void> {
    const requests = this.batch.get(key);
    if (!requests || requests.length === 0) {
      return;
    }

    this.batch.delete(key);

    try {
      const requestData = requests.map(r => r.request);
      const results = await this.processor(requestData);

      requests.forEach((req, index) => {
        req.resolve(results[index]);
      });
    } catch (error) {
      requests.forEach(req => {
        req.reject(error);
      });
    }
  }

  /**
   * Clear pending batches
   */
  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.batch.clear();
  }
}

/**
 * Memory pool for object reuse
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = 100
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  /**
   * Get an object from the pool
   */
  public acquire(): T {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      return this.factory();
    }

    const obj = this.pool.pop();
    return obj || this.factory();
  }

  /**
   * Return an object to the pool
   */
  public release(obj: T): void {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      return;
    }

    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  /**
   * Clear the pool
   */
  public clear(): void {
    this.pool = [];
  }

  /**
   * Get pool statistics
   */
  public getStats(): { size: number; maxSize: number } {
    return {
      size: this.pool.length,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Lazy loading wrapper for expensive operations
 */
export class LazyLoader<T> {
  private value: T | null = null;
  private loading: Promise<T> | null = null;
  private loader: () => Promise<T>;
  private ttl: number;
  private loadedAt: number = 0;

  constructor(loader: () => Promise<T>, ttl: number = 60000) {
    this.loader = loader;
    this.ttl = ttl;
  }

  /**
   * Get the value, loading if necessary
   */
  public async get(): Promise<T> {
    if (!features.isEnabled('enablePerformanceOptimization')) {
      return this.loader();
    }

    const now = Date.now();
    
    // Check if cached value is still valid
    if (this.value && (now - this.loadedAt) < this.ttl) {
      return this.value;
    }

    // If already loading, wait for it
    if (this.loading) {
      return this.loading;
    }

    // Start loading
    this.loading = this.loader().then(value => {
      this.value = value;
      this.loadedAt = now;
      this.loading = null;
      return value;
    }).catch(error => {
      this.loading = null;
      throw error;
    });

    return this.loading;
  }

  /**
   * Clear cached value
   */
  public clear(): void {
    this.value = null;
    this.loading = null;
    this.loadedAt = 0;
  }
}

// Export singleton instances
export const performanceMonitor = new PerformanceMonitor();