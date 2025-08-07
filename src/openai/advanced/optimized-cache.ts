/**
 * Optimized Cache Implementation
 * High-performance cache with LRU eviction and memory management
 */

import { features } from '../../config/features.js';
import { performanceMonitor } from './performance.js';
import { debug } from '../../utils/logger.js';

export interface OptimizedCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
  lastAccess: number;
}

export interface OptimizedCacheOptions {
  maxSize?: number;          // Maximum number of entries
  maxMemoryMB?: number;       // Maximum memory usage in MB
  defaultTTL?: number;        // Default TTL in milliseconds
  enableCompression?: boolean; // Enable data compression
  cleanupInterval?: number;   // Cleanup interval in milliseconds
}

export interface OptimizedCacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryUsedMB: number;
  hitRate: number;
  avgAccessTimeMs: number;
}

/**
 * Optimized cache with LRU eviction and memory management
 */
export class OptimizedCache<T = any> {
  private cache: Map<string, OptimizedCacheEntry<T>>;
  private lruOrder: string[]; // Track access order for LRU
  private options: Required<OptimizedCacheOptions>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    totalAccessTime: number;
    accessCount: number;
  };
  private memoryUsed: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: OptimizedCacheOptions = {}) {
    this.cache = new Map();
    this.lruOrder = [];
    this.options = {
      maxSize: options.maxSize || 1000,
      maxMemoryMB: options.maxMemoryMB || 100,
      defaultTTL: options.defaultTTL || 5 * 60 * 1000, // 5 minutes
      enableCompression: options.enableCompression || false,
      cleanupInterval: options.cleanupInterval || 60000, // 1 minute
    };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalAccessTime: 0,
      accessCount: 0,
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get value from cache with performance tracking
   */
  public get(key: string): T | null {
    if (!features.isEnabled('enableCache')) {
      return null;
    }

    const startTime = performance.now();
    const perfId = `cache-get-${key}`;
    
    if (features.isEnabled('enablePerformanceOptimization')) {
      performanceMonitor.startOperation(perfId, 'cache-get', { key });
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateAccessTime(performance.now() - startTime);
      
      if (features.isEnabled('enablePerformanceOptimization')) {
        performanceMonitor.endOperation(perfId, false);
      }
      
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.removeFromLRU(key);
      this.memoryUsed -= entry.size;
      this.stats.misses++;
      this.updateAccessTime(performance.now() - startTime);
      
      if (features.isEnabled('enablePerformanceOptimization')) {
        performanceMonitor.endOperation(perfId, false);
      }
      
      return null;
    }

    // Update hit count and LRU order
    entry.hits++;
    entry.lastAccess = now;
    this.updateLRU(key);
    this.stats.hits++;
    this.updateAccessTime(performance.now() - startTime);

    if (features.isEnabled('enablePerformanceOptimization')) {
      performanceMonitor.endOperation(perfId, true);
    }

    return entry.data;
  }

  /**
   * Set value in cache with size calculation
   */
  public set(key: string, data: T, ttl?: number): void {
    if (!features.isEnabled('enableCache')) {
      return;
    }

    const perfId = `cache-set-${key}`;
    
    if (features.isEnabled('enablePerformanceOptimization')) {
      performanceMonitor.startOperation(perfId, 'cache-set', { key });
    }

    const size = this.calculateSize(data);
    const now = Date.now();

    // Check if we need to evict entries
    if (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }

    // Check memory limit
    while (this.memoryUsed + size > this.options.maxMemoryMB * 1024 * 1024) {
      if (!this.evictLRU()) {
        break; // Can't evict anymore
      }
    }

    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.memoryUsed -= oldEntry.size;
      this.removeFromLRU(key);
    }

    // Create new entry
    const entry: OptimizedCacheEntry<T> = {
      data: this.options.enableCompression ? this.compress(data) : data,
      timestamp: now,
      ttl: ttl || this.options.defaultTTL,
      hits: 0,
      size,
      lastAccess: now,
    };

    this.cache.set(key, entry);
    this.lruOrder.push(key);
    this.memoryUsed += size;

    if (features.isEnabled('enablePerformanceOptimization')) {
      performanceMonitor.endOperation(perfId, true);
    }
  }

  /**
   * Delete entry from cache
   */
  public delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.removeFromLRU(key);
    this.memoryUsed -= entry.size;
    return true;
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
    this.lruOrder = [];
    this.memoryUsed = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalAccessTime: 0,
      accessCount: 0,
    };
  }

  /**
   * Get cache statistics
   */
  public getStats(): OptimizedCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    
    return {
      entries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      memoryUsedMB: this.memoryUsed / 1024 / 1024,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      avgAccessTimeMs: this.stats.accessCount > 0 
        ? this.stats.totalAccessTime / this.stats.accessCount 
        : 0,
    };
  }

  /**
   * Warm up cache with frequently accessed items
   */
  public async warmUp(
    keys: string[],
    loader: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    if (!features.isEnabled('enableCache')) {
      return;
    }

    const promises = keys.map(async (key) => {
      try {
        const data = await loader(key);
        this.set(key, data, ttl);
      } catch (error) {
        debug('OptimizedCache', `Failed to warm up key ${key}`, { error }, 'warmUp');
      }
    });

    await Promise.all(promises);
  }

  /**
   * Private helper methods
   */

  private updateLRU(key: string): void {
    const index = this.lruOrder.indexOf(key);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
    this.lruOrder.push(key);
  }

  private removeFromLRU(key: string): void {
    const index = this.lruOrder.indexOf(key);
    if (index > -1) {
      this.lruOrder.splice(index, 1);
    }
  }

  private evictLRU(): boolean {
    if (this.lruOrder.length === 0) {
      return false;
    }

    const key = this.lruOrder.shift()!;
    const entry = this.cache.get(key);
    
    if (entry) {
      this.cache.delete(key);
      this.memoryUsed -= entry.size;
      this.stats.evictions++;
      
      debug('OptimizedCache', `Evicted LRU entry`, { key, size: entry.size }, 'evictLRU');
    }

    return true;
  }

  private calculateSize(data: any): number {
    // Rough size calculation
    const str = JSON.stringify(data);
    return str.length * 2; // 2 bytes per character (UTF-16)
  }

  private compress(data: T): T {
    // Placeholder for compression logic
    // In production, would use a library like lz-string
    return data;
  }

  private decompress(data: T): T {
    // Placeholder for decompression logic
    return data;
  }

  private updateAccessTime(duration: number): void {
    this.stats.totalAccessTime += duration;
    this.stats.accessCount++;
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }

    if (keysToDelete.length > 0) {
      debug('OptimizedCache', `Cleaned up ${keysToDelete.length} expired entries`, {}, 'cleanup');
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}

/**
 * Create optimized cache instances for different purposes
 */
export const searchCacheOptimized = new OptimizedCache({
  maxSize: 500,
  maxMemoryMB: 50,
  defaultTTL: 10 * 60 * 1000, // 10 minutes
  enableCompression: true,
});

export const recordCacheOptimized = new OptimizedCache({
  maxSize: 200,
  maxMemoryMB: 20,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  enableCompression: false,
});

export const transformCacheOptimized = new OptimizedCache({
  maxSize: 100,
  maxMemoryMB: 10,
  defaultTTL: 60 * 1000, // 1 minute
  enableCompression: false,
});