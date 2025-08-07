/**
 * Cache Metrics and Monitoring Module
 * Provides comprehensive metrics collection, aggregation, and reporting
 */

import { EventEmitter } from 'events';
import { CacheEvent, CacheStats, EvictionReason } from './interface.js';

/**
 * Time window for metrics aggregation
 */
export enum MetricsWindow {
  MINUTE = 60000,
  FIVE_MINUTES = 300000,
  FIFTEEN_MINUTES = 900000,
  HOUR = 3600000,
  DAY = 86400000
}

/**
 * Metric types
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  RATE = 'rate'
}

/**
 * Individual metric data point
 */
export interface MetricDataPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, any>;
}

/**
 * Aggregated metric summary
 */
export interface MetricSummary {
  name: string;
  type: MetricType;
  current: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  count: number;
  rate?: number; // Per second
  percentiles?: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/**
 * Performance metric
 */
export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, any>;
}

/**
 * Memory metric
 */
export interface MemoryMetric {
  used: number;
  limit: number;
  utilization: number; // Percentage
  timestamp: number;
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  name: string;
  metric: string;
  threshold: number;
  condition: 'above' | 'below' | 'equals';
  window: MetricsWindow;
  cooldown: number; // Milliseconds before alert can trigger again
  callback: (alert: Alert) => void;
}

/**
 * Alert event
 */
export interface Alert {
  name: string;
  metric: string;
  value: number;
  threshold: number;
  condition: string;
  timestamp: number;
  message: string;
}

/**
 * Metrics collector for cache monitoring
 */
export class CacheMetricsCollector extends EventEmitter {
  private metrics: Map<string, MetricDataPoint[]>;
  private performanceMetrics: PerformanceMetric[];
  private memoryMetrics: MemoryMetric[];
  private alerts: Map<string, AlertConfig>;
  private alertCooldowns: Map<string, number>;
  private retentionPeriod: number;
  private aggregationInterval: NodeJS.Timeout | null;
  private cleanupInterval: NodeJS.Timeout | null;
  
  constructor(retentionPeriod: number = MetricsWindow.HOUR) {
    super();
    this.metrics = new Map();
    this.performanceMetrics = [];
    this.memoryMetrics = [];
    this.alerts = new Map();
    this.alertCooldowns = new Map();
    this.retentionPeriod = retentionPeriod;
    this.aggregationInterval = null;
    this.cleanupInterval = null;
    
    this.startCleanup();
  }
  
  /**
   * Record a metric value
   */
  record(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const dataPoint: MetricDataPoint = {
      timestamp: Date.now(),
      value,
      metadata
    };
    
    this.metrics.get(name)!.push(dataPoint);
    
    // Check alerts
    this.checkAlerts(name, value);
    
    // Emit metric event
    this.emit('metric', { name, value, timestamp: dataPoint.timestamp });
  }
  
  /**
   * Increment a counter metric
   */
  increment(name: string, value: number = 1): void {
    const current = this.getCurrentValue(name) || 0;
    this.record(name, current + value);
  }
  
  /**
   * Decrement a counter metric
   */
  decrement(name: string, value: number = 1): void {
    const current = this.getCurrentValue(name) || 0;
    this.record(name, Math.max(0, current - value));
  }
  
  /**
   * Record a performance metric
   */
  recordPerformance(operation: string, duration: number, success: boolean = true, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      success,
      metadata
    };
    
    this.performanceMetrics.push(metric);
    
    // Also record as regular metric for aggregation
    this.record(`performance.${operation}.duration`, duration);
    this.record(`performance.${operation}.${success ? 'success' : 'failure'}`, 1);
    
    this.emit('performance', metric);
  }
  
  /**
   * Record memory usage
   */
  recordMemory(used: number, limit: number): void {
    const metric: MemoryMetric = {
      used,
      limit,
      utilization: limit > 0 ? (used / limit) * 100 : 0,
      timestamp: Date.now()
    };
    
    this.memoryMetrics.push(metric);
    
    // Also record as regular metrics
    this.record('memory.used', used);
    this.record('memory.limit', limit);
    this.record('memory.utilization', metric.utilization);
    
    this.emit('memory', metric);
  }
  
  /**
   * Record cache statistics
   */
  recordCacheStats(stats: CacheStats): void {
    this.record('cache.hits', stats.hits);
    this.record('cache.misses', stats.misses);
    this.record('cache.hitRate', stats.hitRate);
    this.record('cache.size', stats.size);
    
    // Record evictions
    for (const [reason, count] of Object.entries(stats.evictions)) {
      this.record(`cache.evictions.${reason}`, count);
    }
    
    // Record memory if available
    if (stats.memoryUsage !== undefined) {
      this.recordMemory(stats.memoryUsage, stats.maxMemory || 0);
    }
    
    // Record performance if available
    if (stats.avgAccessTime !== undefined) {
      this.record('cache.performance.access', stats.avgAccessTime);
    }
    if (stats.avgWriteTime !== undefined) {
      this.record('cache.performance.write', stats.avgWriteTime);
    }
  }
  
  /**
   * Get current value of a metric
   */
  getCurrentValue(name: string): number | undefined {
    const points = this.metrics.get(name);
    if (!points || points.length === 0) return undefined;
    return points[points.length - 1].value;
  }
  
  /**
   * Get metric summary for a time window
   */
  getMetricSummary(name: string, window: MetricsWindow = MetricsWindow.FIVE_MINUTES): MetricSummary | null {
    const points = this.getMetricPoints(name, window);
    if (points.length === 0) return null;
    
    const values = points.map(p => p.value);
    values.sort((a, b) => a - b);
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    
    // Calculate rate (per second)
    const timeSpan = points[points.length - 1].timestamp - points[0].timestamp;
    const rate = timeSpan > 0 ? (sum / timeSpan) * 1000 : 0;
    
    // Calculate percentiles
    const percentiles = {
      p50: this.percentile(values, 50),
      p75: this.percentile(values, 75),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
    
    return {
      name,
      type: this.inferMetricType(name),
      current: values[values.length - 1],
      min: values[0],
      max: values[values.length - 1],
      avg,
      sum,
      count: values.length,
      rate,
      percentiles
    };
  }
  
  /**
   * Get all metrics summaries
   */
  getAllMetrics(window: MetricsWindow = MetricsWindow.FIVE_MINUTES): Map<string, MetricSummary> {
    const summaries = new Map<string, MetricSummary>();
    
    for (const name of this.metrics.keys()) {
      const summary = this.getMetricSummary(name, window);
      if (summary) {
        summaries.set(name, summary);
      }
    }
    
    return summaries;
  }
  
  /**
   * Get performance summary
   */
  getPerformanceSummary(operation?: string, window: MetricsWindow = MetricsWindow.FIVE_MINUTES): Record<string, any> {
    const cutoff = Date.now() - window;
    let metrics = this.performanceMetrics.filter(m => m.timestamp > cutoff);
    
    if (operation) {
      metrics = metrics.filter(m => m.operation === operation);
    }
    
    if (metrics.length === 0) {
      return { count: 0, operations: {} };
    }
    
    // Group by operation
    const grouped = metrics.reduce((acc, m) => {
      if (!acc[m.operation]) {
        acc[m.operation] = {
          count: 0,
          success: 0,
          failure: 0,
          durations: []
        };
      }
      
      acc[m.operation].count++;
      if (m.success) {
        acc[m.operation].success++;
      } else {
        acc[m.operation].failure++;
      }
      acc[m.operation].durations.push(m.duration);
      
      return acc;
    }, {} as Record<string, any>);
    
    // Calculate stats for each operation
    const summary: Record<string, any> = {
      count: metrics.length,
      operations: {}
    };
    
    for (const [op, data] of Object.entries(grouped)) {
      const durations = data.durations.sort((a: number, b: number) => a - b);
      summary.operations[op] = {
        count: data.count,
        successRate: (data.success / data.count) * 100,
        avgDuration: durations.reduce((a: number, b: number) => a + b, 0) / durations.length,
        minDuration: durations[0],
        maxDuration: durations[durations.length - 1],
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99)
      };
    }
    
    return summary;
  }
  
  /**
   * Get memory usage summary
   */
  getMemorySummary(window: MetricsWindow = MetricsWindow.FIVE_MINUTES): Record<string, any> {
    const cutoff = Date.now() - window;
    const metrics = this.memoryMetrics.filter(m => m.timestamp > cutoff);
    
    if (metrics.length === 0) {
      return { current: 0, avg: 0, max: 0, utilization: 0 };
    }
    
    const utilisations = metrics.map(m => m.utilization);
    const usages = metrics.map(m => m.used);
    
    return {
      current: metrics[metrics.length - 1].used,
      currentUtilization: metrics[metrics.length - 1].utilization,
      avg: usages.reduce((a, b) => a + b, 0) / usages.length,
      max: Math.max(...usages),
      avgUtilization: utilisations.reduce((a, b) => a + b, 0) / utilisations.length,
      maxUtilization: Math.max(...utilisations),
      limit: metrics[metrics.length - 1].limit
    };
  }
  
  /**
   * Configure an alert
   */
  configureAlert(config: AlertConfig): void {
    this.alerts.set(config.name, config);
  }
  
  /**
   * Remove an alert
   */
  removeAlert(name: string): void {
    this.alerts.delete(name);
    this.alertCooldowns.delete(name);
  }
  
  /**
   * Export metrics for external monitoring
   */
  export(format: 'json' | 'prometheus' = 'json'): string {
    if (format === 'prometheus') {
      return this.exportPrometheus();
    }
    
    const data = {
      timestamp: Date.now(),
      metrics: Object.fromEntries(this.getAllMetrics()),
      performance: this.getPerformanceSummary(),
      memory: this.getMemorySummary()
    };
    
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Export in Prometheus format
   */
  private exportPrometheus(): string {
    const lines: string[] = [];
    const timestamp = Date.now();
    
    for (const [name, summary] of this.getAllMetrics()) {
      const metricName = name.replace(/\./g, '_');
      
      // Current value
      lines.push(`# TYPE ${metricName} gauge`);
      lines.push(`${metricName} ${summary.current} ${timestamp}`);
      
      // Additional stats
      if (summary.type === MetricType.HISTOGRAM) {
        lines.push(`# TYPE ${metricName}_sum gauge`);
        lines.push(`${metricName}_sum ${summary.sum} ${timestamp}`);
        lines.push(`# TYPE ${metricName}_count gauge`);
        lines.push(`${metricName}_count ${summary.count} ${timestamp}`);
        
        if (summary.percentiles) {
          lines.push(`${metricName}_p50 ${summary.percentiles.p50} ${timestamp}`);
          lines.push(`${metricName}_p95 ${summary.percentiles.p95} ${timestamp}`);
          lines.push(`${metricName}_p99 ${summary.percentiles.p99} ${timestamp}`);
        }
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.performanceMetrics = [];
    this.memoryMetrics = [];
    this.alertCooldowns.clear();
  }
  
  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.removeAllListeners();
    this.reset();
  }
  
  // Private helper methods
  
  /**
   * Get metric points within a time window
   */
  private getMetricPoints(name: string, window: MetricsWindow): MetricDataPoint[] {
    const points = this.metrics.get(name);
    if (!points) return [];
    
    const cutoff = Date.now() - window;
    return points.filter(p => p.timestamp > cutoff);
  }
  
  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  /**
   * Infer metric type from name
   */
  private inferMetricType(name: string): MetricType {
    if (name.includes('rate') || name.includes('Rate')) return MetricType.RATE;
    if (name.includes('count') || name.includes('hits') || name.includes('misses')) return MetricType.COUNTER;
    if (name.includes('duration') || name.includes('time')) return MetricType.HISTOGRAM;
    return MetricType.GAUGE;
  }
  
  /**
   * Check alerts
   */
  private checkAlerts(metricName: string, value: number): void {
    for (const [alertName, config] of this.alerts) {
      if (config.metric !== metricName) continue;
      
      // Check cooldown
      const lastAlert = this.alertCooldowns.get(alertName);
      if (lastAlert && Date.now() - lastAlert < config.cooldown) {
        continue;
      }
      
      // Check condition
      let triggered = false;
      switch (config.condition) {
        case 'above':
          triggered = value > config.threshold;
          break;
        case 'below':
          triggered = value < config.threshold;
          break;
        case 'equals':
          triggered = value === config.threshold;
          break;
      }
      
      if (triggered) {
        const alert: Alert = {
          name: alertName,
          metric: metricName,
          value,
          threshold: config.threshold,
          condition: config.condition,
          timestamp: Date.now(),
          message: `Alert ${alertName}: ${metricName} is ${config.condition} ${config.threshold} (current: ${value})`
        };
        
        // Set cooldown
        this.alertCooldowns.set(alertName, Date.now());
        
        // Call callback
        config.callback(alert);
        
        // Emit alert event
        this.emit('alert', alert);
      }
    }
  }
  
  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, MetricsWindow.MINUTE);
    
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
  
  /**
   * Clean up old metrics
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.retentionPeriod;
    
    // Clean metric points
    for (const [name, points] of this.metrics) {
      const filtered = points.filter(p => p.timestamp > cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(name);
      } else {
        this.metrics.set(name, filtered);
      }
    }
    
    // Clean performance metrics
    this.performanceMetrics = this.performanceMetrics.filter(m => m.timestamp > cutoff);
    
    // Clean memory metrics
    this.memoryMetrics = this.memoryMetrics.filter(m => m.timestamp > cutoff);
  }
}

/**
 * Default metrics collector instance
 */
export const defaultMetricsCollector = new CacheMetricsCollector();