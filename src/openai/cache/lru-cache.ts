/**
 * LRU Cache Implementation using node-lru-cache
 * Provides high-performance caching with automatic eviction
 */

import LRUCache from 'lru-cache';
import {
  BaseCache,
  CacheConfig,
  CacheEntry,
  CacheEvent,
  CacheOperationOptions,
  CacheStats,
  EvictionReason,
  ICache
} from './interface.js';

/**
 * Extended options for LRU cache
 */
export interface LRUCacheConfig extends CacheConfig {
  /** Update age on get (move to front) */
  updateAgeOnGet?: boolean;
  /** Update age on has */
  updateAgeOnHas?: boolean;
  /** Allow stale entries to be returned */
  allowStale?: boolean;
  /** Maximum age for stale entries in ms */
  maxStale?: number;
  /** Size calculation function */
  sizeCalculation?: <V>(value: V) => number;
}

/**
 * Internal entry structure with metadata
 */
interface InternalEntry<V> {
  value: V;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  size?: number;
  serialized?: string;
}

/**
 * LRU Cache implementation with advanced features
 */
export class LRUMemoryCache<K = string, V = any> extends BaseCache<K, V> implements ICache<K, V> {
  private cache: LRUCache<K, InternalEntry<V>>;
  private cleanupTimer?: NodeJS.Timeout;
  private performanceTimer: Map<string, number>;
  
  constructor(config: LRUCacheConfig = {}) {
    super(config);
    
    this.performanceTimer = new Map();
    
    // Create LRU cache with custom options
    this.cache = new LRUCache<K, InternalEntry<V>>({
      max: this.config.maxSize,
      ttl: this.config.defaultTTL,
      allowStale: config.allowStale ?? false,
      updateAgeOnGet: config.updateAgeOnGet ?? true,
      updateAgeOnHas: config.updateAgeOnHas ?? false,
      
      // Size-based eviction if maxMemory is set
      maxSize: this.config.maxMemory || undefined,
      sizeCalculation: this.config.maxMemory ? (entry) => {
        return entry.size || this.calculateSize(entry.value);
      } : undefined,
      
      // Disposal handler for evicted items
      dispose: (entry, key, reason) => {
        this.handleEviction(key as K, entry, this.mapDisposeReason(reason));
      },
      
      // No auto-pruning, we'll handle it manually
      ttlAutopurge: false
    });
    
    // Setup automatic cleanup if enabled
    if (this.config.autoCleanup && this.config.defaultTTL > 0) {
      this.startCleanupTimer();
    }
  }
  
  /**
   * Get a value from cache
   */
  get(key: K): V | undefined {
    const startTime = this.config.enableMetrics ? Date.now() : 0;
    
    try {
      const entry = this.cache.get(key);
      
      if (entry) {
        // Update access metadata
        entry.lastAccessedAt = Date.now();
        entry.accessCount++;
        
        // Update stats
        if (this.config.enableMetrics) {
          this.stats.hits++;
          this.updateHitRate();
          this.recordPerformance('get', startTime);
        }
        
        this.emit(CacheEvent.HIT, { key, value: entry.value });
        return entry.value;
      } else {
        // Cache miss
        if (this.config.enableMetrics) {
          this.stats.misses++;
          this.updateHitRate();
          this.recordPerformance('get', startTime);
        }
        
        this.emit(CacheEvent.MISS, { key });
        return undefined;
      }
    } catch (error) {
      this.emit(CacheEvent.ERROR, { key, error: error as Error });
      return undefined;
    }
  }
  
  /**
   * Set a value in cache
   */
  set(key: K, value: V, options?: CacheOperationOptions): boolean {
    const startTime = this.config.enableMetrics ? Date.now() : 0;
    
    try {
      const now = Date.now();
      const ttl = options?.ttl ?? this.config.defaultTTL;
      const size = this.calculateSize(value);
      
      // Check if we're replacing an existing entry
      const existing = this.cache.get(key);
      
      // Create internal entry
      const entry: InternalEntry<V> = {
        value,
        createdAt: now,
        lastAccessedAt: now,
        accessCount: 0,
        size
      };
      
      // Serialize if needed
      if (!options?.skipSerialization && this.config.serialize) {
        try {
          entry.serialized = this.config.serialize(value);
        } catch (error) {
          // Serialization failed, still cache the value
          console.warn(`Serialization failed for key ${key}:`, error);
        }
      }
      
      // Set in cache with TTL
      const success = this.cache.set(key, entry, { ttl });
      
      if (success) {
        // Update stats
        this.stats.size = this.cache.size;
        
        if (this.config.enableMetrics) {
          this.recordPerformance('set', startTime);
        }
        
        // Emit event
        this.emit(CacheEvent.SET, { key, value });
        
        // If we replaced an existing entry
        if (existing) {
          this.stats.evictions[EvictionReason.REPLACED]++;
        }
      }
      
      return success;
    } catch (error) {
      this.emit(CacheEvent.ERROR, { key, value, error: error as Error });
      return false;
    }
  }
  
  /**
   * Check if key exists
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }
  
  /**
   * Delete a key from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      const success = this.cache.delete(key);
      if (success) {
        this.stats.size = this.cache.size;
        this.stats.evictions[EvictionReason.MANUAL]++;
        this.emit(CacheEvent.DELETE, { key, value: entry.value });
      }
      return success;
    }
    return false;
  }
  
  /**
   * Clear all entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.stats.evictions[EvictionReason.MANUAL] += size;
    this.emit(CacheEvent.CLEAR);
  }
  
  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * Get all keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get all values
   */
  values(): V[] {
    const values: V[] = [];
    for (const entry of this.cache.values()) {
      values.push(entry.value);
    }
    return values;
  }
  
  /**
   * Get all entries
   */
  entries(): Array<[K, V]> {
    const entries: Array<[K, V]> = [];
    for (const [key, entry] of this.cache.entries()) {
      entries.push([key, entry.value]);
    }
    return entries;
  }
  
  /**
   * Get metadata for an entry
   */
  getEntry(key: K): CacheEntry<V> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    const ttl = this.cache.getTtl(key) || 0;
    const now = Date.now();
    
    return {
      value: entry.value,
      createdAt: entry.createdAt,
      lastAccessedAt: entry.lastAccessedAt,
      ttl,
      expiresAt: ttl > 0 ? now + ttl : 0,
      accessCount: entry.accessCount,
      size: entry.size
    };
  }
  
  /**
   * Update TTL for an entry
   */
  touch(key: K, ttl?: number): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Re-set with new TTL
    return this.cache.set(key, entry, { 
      ttl: ttl ?? this.config.defaultTTL 
    });
  }
  
  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const before = this.cache.size;
    this.cache.purgeStale();
    const removed = before - this.cache.size;
    
    if (removed > 0) {
      this.stats.evictions[EvictionReason.TTL] += removed;
      this.stats.size = this.cache.size;
    }
    
    return removed;
  }
  
  /**
   * Prune cache to stay within limits
   */
  prune(): number {
    const before = this.cache.size;
    
    // Force prune to max size
    while (this.cache.size > this.config.maxSize) {
      // Get oldest key
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }
    
    const removed = before - this.cache.size;
    if (removed > 0) {
      this.stats.evictions[EvictionReason.SIZE] += removed;
      this.stats.size = this.cache.size;
    }
    
    return removed;
  }
  
  /**
   * Get memory usage
   */
  getMemoryUsage(): number | undefined {
    if (!this.config.maxMemory) return undefined;
    
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size || 0;
    }
    
    this.stats.memoryUsage = totalSize;
    return totalSize;
  }
  
  /**
   * Warm cache with initial data
   */
  async warm(entries: Array<[K, V]>, options?: CacheOperationOptions): Promise<void> {
    for (const [key, value] of entries) {
      this.set(key, value, options);
    }
  }
  
  /**
   * Export cache contents
   */
  export(): Array<[K, CacheEntry<V>]> {
    const exported: Array<[K, CacheEntry<V>]> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      const ttl = this.cache.getTtl(key) || 0;
      const now = Date.now();
      
      exported.push([key, {
        value: entry.value,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
        ttl,
        expiresAt: ttl > 0 ? now + ttl : 0,
        accessCount: entry.accessCount,
        size: entry.size
      }]);
    }
    
    return exported;
  }
  
  /**
   * Import cache contents
   */
  import(data: Array<[K, CacheEntry<V>]>): boolean {
    try {
      for (const [key, cacheEntry] of data) {
        const now = Date.now();
        const ttl = cacheEntry.expiresAt > 0 ? cacheEntry.expiresAt - now : 0;
        
        // Skip expired entries
        if (ttl < 0) continue;
        
        const entry: InternalEntry<V> = {
          value: cacheEntry.value,
          createdAt: cacheEntry.createdAt,
          lastAccessedAt: cacheEntry.lastAccessedAt,
          accessCount: cacheEntry.accessCount,
          size: cacheEntry.size
        };
        
        this.cache.set(key, entry, { ttl });
      }
      
      this.stats.size = this.cache.size;
      return true;
    } catch (error) {
      console.error('Failed to import cache data:', error);
      return false;
    }
  }
  
  /**
   * Get enhanced statistics
   */
  getStats(): CacheStats {
    const stats = super.getStats();
    
    // Add LRU-specific stats
    stats.size = this.cache.size;
    
    // Calculate memory usage if applicable
    if (this.config.maxMemory) {
      stats.memoryUsage = this.getMemoryUsage();
    }
    
    // Add performance metrics
    if (this.config.enableMetrics) {
      stats.avgAccessTime = this.getAveragePerformance('get');
      stats.avgWriteTime = this.getAveragePerformance('set');
    }
    
    return stats;
  }
  
  /**
   * Dispose of cache resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.cache.clear();
    this.eventHandlers.clear();
    this.performanceTimer.clear();
  }
  
  // Private helper methods
  
  /**
   * Calculate size of a value
   */
  private calculateSize(value: V): number {
    if (typeof value === 'string') {
      return value.length * 2; // Unicode chars can be 2 bytes
    } else if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value).length * 2;
      } catch {
        return 1024; // Default size for non-serializable objects
      }
    } else {
      return 8; // Default for primitives
    }
  }
  
  /**
   * Map LRU dispose reason to our eviction reason
   */
  private mapDisposeReason(reason: LRUCache.DisposeReason): EvictionReason {
    switch (reason) {
      case 'evict':
        return EvictionReason.SIZE;
      case 'expire':
        return EvictionReason.TTL;
      case 'delete':
        return EvictionReason.MANUAL;
      case 'set':
        return EvictionReason.REPLACED;
      default:
        return EvictionReason.SIZE;
    }
  }
  
  /**
   * Handle eviction event
   */
  private handleEviction(key: K, entry: InternalEntry<V>, reason: EvictionReason): void {
    this.stats.evictions[reason]++;
    this.config.onEviction(key, entry.value, reason);
    this.emit(CacheEvent.EVICT, { key, value: entry.value, reason });
  }
  
  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
    
    // Don't block Node.js exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
  
  /**
   * Record performance metrics
   */
  private recordPerformance(operation: string, startTime: number): void {
    if (!this.config.enableMetrics) return;
    
    const duration = Date.now() - startTime;
    const key = `${operation}_times`;
    
    if (!this.performanceTimer.has(key)) {
      this.performanceTimer.set(key, 0);
      this.performanceTimer.set(`${key}_count`, 0);
    }
    
    this.performanceTimer.set(
      key, 
      (this.performanceTimer.get(key) || 0) + duration
    );
    this.performanceTimer.set(
      `${key}_count`,
      (this.performanceTimer.get(`${key}_count`) || 0) + 1
    );
  }
  
  /**
   * Get average performance for an operation
   */
  private getAveragePerformance(operation: string): number {
    const key = `${operation}_times`;
    const total = this.performanceTimer.get(key) || 0;
    const count = this.performanceTimer.get(`${key}_count`) || 0;
    
    return count > 0 ? total / count : 0;
  }
}

/**
 * Factory function for creating LRU cache instances
 */
export function createLRUCache<K = string, V = any>(config?: LRUCacheConfig): ICache<K, V> {
  return new LRUMemoryCache<K, V>(config);
}