/**
 * Unified Cache System for OpenAI Module
 * Central export point for all cache functionality
 */

// Core interfaces and types
export {
  ICache,
  ICacheFactory,
  CacheConfig,
  CacheEntry,
  CacheStats,
  CacheOperationOptions,
  CacheEvent,
  CacheEventHandler,
  CacheStrategy,
  EvictionReason,
  BaseCache
} from './interface.js';

// LRU cache implementation
export {
  LRUMemoryCache,
  LRUCacheConfig,
  createLRUCache
} from './lru-cache.js';

// Serialization utilities
export {
  ISerializer,
  SerializationOptions,
  SerializationResult,
  JSONSerializer,
  BufferSerializer,
  CompositeSerializer,
  TTLManager,
  SizeCalculator,
  Serializers
} from './serialization.js';

// Metrics and monitoring
export {
  CacheMetricsCollector,
  MetricsWindow,
  MetricType,
  MetricDataPoint,
  MetricSummary,
  PerformanceMetric,
  MemoryMetric,
  AlertConfig,
  Alert,
  defaultMetricsCollector
} from './metrics.js';

// Factory and utilities
export {
  CacheFactory,
  IRedisLikeCache,
  RedisLikeMemoryCache,
  HybridCache,
  cacheFactory,
  createCache,
  createRedisLikeCache,
  createHybridCache
} from './factory.js';

// Default cache instances with configuration
import { createCache, CacheStrategy } from './factory.js';
import { CacheConfig } from './interface.js';

/**
 * Default cache configurations
 */
const defaultCacheConfig: CacheConfig = {
  maxSize: 1000,
  defaultTTL: 3600000, // 1 hour
  autoCleanup: true,
  cleanupInterval: 60000, // 1 minute
  enableMetrics: true
};

/**
 * Pre-configured cache instances for OpenAI module
 */
export const searchCache = createCache<string, any>(CacheStrategy.LRU, {
  ...defaultCacheConfig,
  maxSize: 500,
  defaultTTL: 1800000 // 30 minutes for search results
});

export const recordCache = createCache<string, any>(CacheStrategy.LRU, {
  ...defaultCacheConfig,
  maxSize: 200,
  defaultTTL: 3600000 // 1 hour for individual records
});

export const attributeCache = createCache<string, any>(CacheStrategy.LRU, {
  ...defaultCacheConfig,
  maxSize: 100,
  defaultTTL: 7200000 // 2 hours for attribute definitions
});

export const transformCache = createCache<string, any>(CacheStrategy.LRU, {
  ...defaultCacheConfig,
  maxSize: 300,
  defaultTTL: 1800000 // 30 minutes for transformations
});

/**
 * Optimized cache instances (aliases for compatibility)
 */
export const searchCacheOptimized = searchCache;
export const recordCacheOptimized = recordCache;
export const transformCacheOptimized = transformCache;

/**
 * Cache warming utility
 */
export async function warmCaches(data: {
  search?: Array<[string, any]>;
  record?: Array<[string, any]>;
  attribute?: Array<[string, any]>;
  transform?: Array<[string, any]>;
}): Promise<void> {
  const promises: Promise<void>[] = [];
  
  if (data.search) {
    promises.push(searchCache.warm(data.search));
  }
  
  if (data.record) {
    promises.push(recordCache.warm(data.record));
  }
  
  if (data.attribute) {
    promises.push(attributeCache.warm(data.attribute));
  }
  
  if (data.transform) {
    promises.push(transformCache.warm(data.transform));
  }
  
  await Promise.all(promises);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  searchCache.clear();
  recordCache.clear();
  attributeCache.clear();
  transformCache.clear();
}

/**
 * Get combined cache statistics
 */
export function getAllCacheStats(): Record<string, CacheStats> {
  return {
    search: searchCache.getStats(),
    record: recordCache.getStats(),
    attribute: attributeCache.getStats(),
    transform: transformCache.getStats()
  };
}

/**
 * Dispose of all cache resources
 */
export function disposeAllCaches(): void {
  searchCache.dispose();
  recordCache.dispose();
  attributeCache.dispose();
  transformCache.dispose();
}