/**
 * Advanced Caching System with TTL Support
 * Provides in-memory caching for API responses and computed data
 */

import { features } from '../../config/features.js';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  enableStats?: boolean; // Enable cache statistics
}

/**
 * Advanced cache implementation with TTL and eviction policies
 */
export class AdvancedCache<T = any> {
  private cache: Map<string, CacheEntry<T>>;
  private options: Required<CacheOptions>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    sets: number;
  };

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.options = {
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      maxSize: options.maxSize || 1000,
      enableStats: options.enableStats || false,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
    };
  }

  /**
   * Get value from cache
   */
  public get(key: string): T | undefined {
    if (!features.isEnabled('enableCache')) {
      return undefined;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      if (this.options.enableStats) {
        this.stats.misses++;
      }
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      if (this.options.enableStats) {
        this.stats.misses++;
      }
      return undefined;
    }

    // Update hit count
    entry.hits++;
    if (this.options.enableStats) {
      this.stats.hits++;
    }

    return entry.data;
  }

  /**
   * Set value in cache
   */
  public set(key: string, value: T, ttl?: number): void {
    if (!features.isEnabled('enableCache')) {
      return;
    }

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.options.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || this.options.ttl,
      hits: 0,
    };

    this.cache.set(key, entry);
    
    if (this.options.enableStats) {
      this.stats.sets++;
    }
  }

  /**
   * Check if key exists in cache
   */
  public has(key: string): boolean {
    if (!features.isEnabled('enableCache')) {
      return false;
    }

    const value = this.get(key);
    return value !== undefined;
  }

  /**
   * Delete entry from cache
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  public getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
    };
  }

  /**
   * Evict oldest entry (LRU policy)
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.options.enableStats) {
        this.stats.evictions++;
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  public cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}

// Global cache instances for different data types
export const searchCache = new AdvancedCache({ ttl: 5 * 60 * 1000 }); // 5 minutes
export const recordCache = new AdvancedCache({ ttl: 10 * 60 * 1000 }); // 10 minutes
export const attributeCache = new AdvancedCache({ ttl: 60 * 60 * 1000 }); // 1 hour