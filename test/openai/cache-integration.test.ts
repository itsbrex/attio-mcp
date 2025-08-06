/**
 * Tests for cache integration in OpenAI search and fetch operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { features } from '../../src/config/features.js';
import { searchCache, recordCache } from '../../src/openai/advanced/index.js';
import { cacheManager } from '../../src/config/cache-config.js';

// Mock the executeToolRequest function
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          {
            id: 'company_123',
            name: 'Test Company',
            domain: 'test.com',
          },
        ]),
      },
    ],
  }),
}));

// Mock the transformers
vi.mock('../../src/openai/transformers/index.js', () => ({
  transformToSearchResult: vi.fn((record) => ({
    id: record.id,
    title: record.name || 'Unknown',
    text: `${record.name} - ${record.domain}`,
    url: `https://app.attio.com/companies/${record.id}`,
    metadata: record,
  })),
  transformToFetchResult: vi.fn((record) => ({
    id: record.id,
    title: record.name || 'Unknown',
    text: `Detailed info for ${record.name}`,
    url: `https://app.attio.com/companies/${record.id}`,
    metadata: record,
  })),
}));

describe('Cache Integration', () => {
  beforeEach(() => {
    // Clear all caches before each test
    cacheManager.clearAll();

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset feature flags
    features.reset();

    // Stop cache cleanup
    cacheManager.stopCleanup();
  });

  describe('Search Caching', () => {
    it('should not use cache when feature is disabled', async () => {
      features.updateFlags({ enableCache: false });

      const query = 'test company';

      // First search
      await search(query);
      expect(searchCache.size()).toBe(0);

      // Second search - should not hit cache
      await search(query);
      expect(searchCache.size()).toBe(0);
    });

    it('should cache search results when enabled', async () => {
      features.updateFlags({ enableCache: true });

      const query = 'test company';

      // First search - should miss cache
      const result1 = await search(query);
      expect(searchCache.size()).toBe(1);
      expect(result1).toBeDefined();

      // Clear mocks to verify cache hit
      vi.clearAllMocks();

      // Second search - should hit cache
      const result2 = await search(query);
      expect(result2).toEqual(result1);

      // executeToolRequest should not be called on cache hit
      const { executeToolRequest } = await import(
        '../../src/handlers/tools/dispatcher.js'
      );
      expect(executeToolRequest).not.toHaveBeenCalled();
    });

    it('should use different cache keys for different queries', async () => {
      features.updateFlags({ enableCache: true });

      await search('query1');
      await search('query2');

      expect(searchCache.size()).toBe(2);
    });

    it('should apply relevance scoring when enabled', async () => {
      features.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
      });

      // Mock multiple results for scoring
      const { executeToolRequest } = await import(
        '../../src/handlers/tools/dispatcher.js'
      );
      (executeToolRequest as any).mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                id: 'company_1',
                name: 'Exact Match Company',
                domain: 'exact.com',
              },
              {
                id: 'company_2',
                name: 'Partial Company',
                domain: 'partial.com',
              },
              {
                id: 'company_3',
                name: 'Other Business',
                domain: 'other.com',
              },
            ]),
          },
        ],
      });

      const results = await search('exact match');

      // Results should be sorted by relevance
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // The exact match should come first
      if (results.length > 1) {
        expect(results[0].title).toContain('Exact Match');
      }
    });
  });

  describe('Fetch Caching', () => {
    it('should not use cache when feature is disabled', async () => {
      features.updateFlags({ enableCache: false });

      const id = 'companies:123';

      // First fetch
      await fetch(id);
      expect(recordCache.size()).toBe(0);

      // Second fetch - should not hit cache
      await fetch(id);
      expect(recordCache.size()).toBe(0);
    });

    it('should cache fetch results when enabled', async () => {
      features.updateFlags({ enableCache: true });

      const id = 'companies:123';

      // First fetch - should miss cache
      const result1 = await fetch(id);
      expect(recordCache.size()).toBe(1);
      expect(result1).toBeDefined();

      // Clear mocks to verify cache hit
      vi.clearAllMocks();

      // Second fetch - should hit cache
      const result2 = await fetch(id);
      expect(result2).toEqual(result1);

      // executeToolRequest should not be called on cache hit
      const { executeToolRequest } = await import(
        '../../src/handlers/tools/dispatcher.js'
      );
      expect(executeToolRequest).not.toHaveBeenCalled();
    });

    it('should use different cache keys for different IDs', async () => {
      features.updateFlags({ enableCache: true });

      await fetch('companies:123');
      await fetch('companies:456');

      expect(recordCache.size()).toBe(2);
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', async () => {
      features.updateFlags({ enableCache: true });

      // Add some cached data
      await search('test');
      await fetch('companies:123');

      expect(searchCache.size()).toBe(1);
      expect(recordCache.size()).toBe(1);

      // Clear all caches
      cacheManager.clearAll();

      expect(searchCache.size()).toBe(0);
      expect(recordCache.size()).toBe(0);
    });

    it('should provide cache statistics', async () => {
      features.updateFlags({ enableCache: true });

      // Add some cached data
      await search('test');
      await fetch('companies:123');

      const stats = cacheManager.getStats();

      expect(stats.enabled).toBe(true);
      expect(stats.totalSize).toBe(2);
      expect(stats.search).toBeDefined();
      expect(stats.record).toBeDefined();
    });

    it('should return disabled status when cache is off', () => {
      features.updateFlags({ enableCache: false });

      const stats = cacheManager.getStats();

      expect(stats.enabled).toBe(false);
      expect(stats.message).toBe('Cache is disabled');
    });
  });

  describe('Cache TTL and Cleanup', () => {
    it('should cleanup expired entries', async () => {
      features.updateFlags({ enableCache: true });

      // Add some cached data with short TTL
      searchCache.set('test-key', { data: 'test' }, 100); // 100ms TTL

      expect(searchCache.size()).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Cleanup should remove expired entry
      cacheManager.cleanupExpiredEntries();

      // Try to get the expired entry
      const result = searchCache.get('test-key');
      expect(result).toBeUndefined();
    });
  });
});
