/**
 * Cache Configuration and Management
 * Provides utilities for configuring and managing the cache system
 */

import {
  searchCache,
  recordCache,
  attributeCache,
} from '../openai/advanced/index.js';
import { features } from './features.js';

export interface CacheConfig {
  searchTTL?: number; // TTL for search results in milliseconds
  recordTTL?: number; // TTL for record fetches in milliseconds
  attributeTTL?: number; // TTL for attribute data in milliseconds
  maxSize?: number; // Maximum number of entries per cache
  enableStats?: boolean; // Enable cache statistics tracking
}

/**
 * Default cache configuration
 */
export const defaultCacheConfig: CacheConfig = {
  searchTTL: 5 * 60 * 1000, // 5 minutes for search results
  recordTTL: 10 * 60 * 1000, // 10 minutes for individual records
  attributeTTL: 60 * 60 * 1000, // 1 hour for attributes (rarely change)
  maxSize: 1000, // Maximum 1000 entries per cache
  enableStats: false, // Statistics disabled by default
};

/**
 * Cache management utilities
 */
export class CacheManager {
  private static instance: CacheManager;
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    // Start cleanup interval if cache is enabled
    if (features.isEnabled('enableCache')) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  /**
   * Start periodic cache cleanup
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Cleanup expired entries from all caches
   */
  public cleanupExpiredEntries(): void {
    if (!features.isEnabled('enableCache')) {
      return;
    }

    searchCache.cleanup();
    recordCache.cleanup();
    attributeCache.cleanup();

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[CacheManager] Cleaned up expired cache entries');
    }
  }

  /**
   * Clear all caches
   */
  public clearAll(): void {
    searchCache.clear();
    recordCache.clear();
    attributeCache.clear();

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[CacheManager] Cleared all cache entries');
    }
  }

  /**
   * Get cache statistics
   */
  public getStats(): Record<string, any> {
    if (!features.isEnabled('enableCache')) {
      return {
        enabled: false,
        message: 'Cache is disabled',
      };
    }

    return {
      enabled: true,
      search: searchCache.getStats(),
      record: recordCache.getStats(),
      attribute: attributeCache.getStats(),
      totalSize:
        searchCache.size() + recordCache.size() + attributeCache.size(),
    };
  }

  /**
   * Warm up cache with frequently accessed data
   */
  public async warmupCache(options?: {
    searchQueries?: string[];
    recordIds?: string[];
  }): Promise<void> {
    if (!features.isEnabled('enableCache')) {
      return;
    }

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[CacheManager] Starting cache warmup', options);
    }

    // Warmup implementation would go here
    // This would pre-fetch frequently accessed data
    // For now, this is a placeholder for future implementation
  }

  /**
   * Stop cleanup interval
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();
