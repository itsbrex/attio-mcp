/**
 * OpenAI Tools Cache Implementation
 * Provides in-memory caching for search and fetch results to improve performance
 */

import {
  OpenAISearchResult,
  OpenAIFetchResult,
  OpenAISearchOptions,
  OpenAICacheConfig,
} from '../types/openai-types.js';
import { IOpenAICache } from './interfaces.js';

/**
 * Cache entry interface
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

/**
 * In-memory cache implementation for OpenAI tools
 */
export class OpenAICache implements IOpenAICache {
  private searchCache = new Map<string, CacheEntry<OpenAISearchResult[]>>();
  private fetchCache = new Map<string, CacheEntry<OpenAIFetchResult>>();
  private config: OpenAICacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(config?: Partial<OpenAICacheConfig>) {
    this.config = {
      enabled: true,
      ttl: 5 * 60 * 1000, // 5 minutes default
      maxSize: 1000,
      keyPrefix: 'openai:',
      ...config,
    };

    // Set up periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Generate cache key for search requests
   */
  private generateSearchKey(query: string, options?: OpenAISearchOptions): string {
    const normalizedQuery = query.toLowerCase().trim();
    const optionsKey = options ? JSON.stringify({
      limit: options.limit,
      types: options.types?.sort(),
      includeRelated: options.includeRelated,
      minRelevance: options.minRelevance,
    }) : '';
    
    return `${this.config.keyPrefix}search:${normalizedQuery}:${optionsKey}`;
  }

  /**
   * Generate cache key for fetch requests
   */
  private generateFetchKey(id: string): string {
    return `${this.config.keyPrefix}fetch:${id}`;
  }

  /**
   * Get cached search results
   */
  async getSearchResults(
    query: string,
    options?: OpenAISearchOptions
  ): Promise<OpenAISearchResult[] | null> {
    if (!this.config.enabled) return null;

    const key = this.generateSearchKey(query, options);
    const entry = this.searchCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.searchCache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update hit count and stats
    entry.hits++;
    this.stats.hits++;

    console.log(`[OpenAI Cache] Search cache hit for query: "${query}"`);
    return entry.data;
  }

  /**
   * Cache search results
   */
  async setSearchResults(
    query: string,
    results: OpenAISearchResult[],
    options?: OpenAISearchOptions
  ): Promise<void> {
    if (!this.config.enabled) return;

    const key = this.generateSearchKey(query, options);
    
    // Ensure cache doesn't exceed max size
    if (this.searchCache.size >= this.config.maxSize) {
      this.evictOldestEntries(this.searchCache, Math.floor(this.config.maxSize * 0.1));
    }

    const entry: CacheEntry<OpenAISearchResult[]> = {
      data: results,
      timestamp: Date.now(),
      ttl: this.config.ttl,
      hits: 0,
    };

    this.searchCache.set(key, entry);
    console.log(`[OpenAI Cache] Cached search results for query: "${query}" (${results.length} results)`);
  }

  /**
   * Get cached fetch result
   */
  async getFetchResult(id: string): Promise<OpenAIFetchResult | null> {
    if (!this.config.enabled) return null;

    const key = this.generateFetchKey(id);
    const entry = this.fetchCache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.fetchCache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update hit count and stats
    entry.hits++;
    this.stats.hits++;

    console.log(`[OpenAI Cache] Fetch cache hit for ID: "${id}"`);
    return entry.data;
  }

  /**
   * Cache fetch result
   */
  async setFetchResult(id: string, result: OpenAIFetchResult): Promise<void> {
    if (!this.config.enabled) return;

    const key = this.generateFetchKey(id);
    
    // Ensure cache doesn't exceed max size
    if (this.fetchCache.size >= this.config.maxSize) {
      this.evictOldestEntries(this.fetchCache, Math.floor(this.config.maxSize * 0.1));
    }

    const entry: CacheEntry<OpenAIFetchResult> = {
      data: result,
      timestamp: Date.now(),
      ttl: this.config.ttl,
      hits: 0,
    };

    this.fetchCache.set(key, entry);
    console.log(`[OpenAI Cache] Cached fetch result for ID: "${id}"`);
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    this.searchCache.clear();
    this.fetchCache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    console.log('[OpenAI Cache] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.searchCache.size + this.fetchCache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      searchCacheSize: this.searchCache.size,
      fetchCacheSize: this.fetchCache.size,
      config: this.config,
    };
  }

  /**
   * Invalidate cache entries for a specific record
   */
  async invalidateRecord(id: string): Promise<void> {
    const fetchKey = this.generateFetchKey(id);
    this.fetchCache.delete(fetchKey);

    // Also invalidate related search results
    // This is a simple approach - in a more sophisticated system,
    // we'd track which searches returned which records
    this.searchCache.clear();

    console.log(`[OpenAI Cache] Invalidated cache for record: "${id}"`);
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<void> {
    let deletedCount = 0;

    // Check search cache
    for (const key of this.searchCache.keys()) {
      if (pattern.test(key)) {
        this.searchCache.delete(key);
        deletedCount++;
      }
    }

    // Check fetch cache
    for (const key of this.fetchCache.keys()) {
      if (pattern.test(key)) {
        this.fetchCache.delete(key);
        deletedCount++;
      }
    }

    console.log(`[OpenAI Cache] Invalidated ${deletedCount} cache entries matching pattern`);
  }

  /**
   * Get cache entry details (for debugging)
   */
  getCacheEntryDetails(type: 'search' | 'fetch', key: string): any {
    if (type === 'search') {
      const entry = this.searchCache.get(key);
      return entry ? {
        dataSize: entry.data.length,
        timestamp: new Date(entry.timestamp).toISOString(),
        ttl: entry.ttl,
        hits: entry.hits,
        expired: Date.now() - entry.timestamp > entry.ttl,
      } : null;
    }

    if (type === 'fetch') {
      const entry = this.fetchCache.get(key);
      return entry ? {
        recordId: entry.data.id,
        timestamp: new Date(entry.timestamp).toISOString(),
        ttl: entry.ttl,
        hits: entry.hits,
        expired: Date.now() - entry.timestamp > entry.ttl,
      } : null;
    }

    return null;
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every 5 minutes
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // Clean search cache
    for (const [key, entry] of this.searchCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.searchCache.delete(key);
        cleanedCount++;
      }
    }

    // Clean fetch cache
    for (const [key, entry] of this.fetchCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.fetchCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[OpenAI Cache] Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldestEntries<T>(cache: Map<string, CacheEntry<T>>, count: number): void {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, count);

    for (const [key] of entries) {
      cache.delete(key);
    }

    console.log(`[OpenAI Cache] Evicted ${entries.length} oldest cache entries`);
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<OpenAICacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[OpenAI Cache] Configuration updated:', this.config);
  }

  /**
   * Warm up cache with common searches
   */
  async warmUp(commonQueries: string[]): Promise<void> {
    console.log(`[OpenAI Cache] Starting cache warm-up with ${commonQueries.length} queries`);
    
    // This is a placeholder - in a real implementation, you'd execute these searches
    // and cache the results proactively
    for (const query of commonQueries) {
      console.log(`[OpenAI Cache] Would warm up cache for: "${query}"`);
    }
  }
}