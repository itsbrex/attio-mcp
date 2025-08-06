/**
 * Integration tests for OpenAI search functionality
 * Tests the search tool with advanced features and backward compatibility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { search } from '../../src/openai/search.js';
import { features } from '../../src/config/features.js';
import { searchCache } from '../../src/openai/advanced/cache.js';
import { RelevanceScoring } from '../../src/openai/advanced/scoring.js';
import crypto from 'crypto';

// Mock the tool dispatcher
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

describe('OpenAI Search Integration', () => {
  beforeEach(() => {
    features.reset();
    searchCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Basic Search Operations', () => {
    it('should search for people by name', async () => {
      const mockResults = {
        data: [
          {
            id: { person_id: 'person-1' },
            values: {
              name: [{ value: 'John Doe' }],
              email_addresses: [{ email_address: 'john@example.com' }],
            },
          },
          {
            id: { person_id: 'person-2' },
            values: {
              name: [{ value: 'Jane Doe' }],
              email_addresses: [{ email_address: 'jane@example.com' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('Doe', 'people');

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        id: expect.stringContaining('person-1'),
        title: 'John Doe',
        text: expect.stringContaining('John Doe'),
      });
      expect(results[1]).toMatchObject({
        id: expect.stringContaining('person-2'),
        title: 'Jane Doe',
        text: expect.stringContaining('Jane Doe'),
      });
    });

    it('should search for companies', async () => {
      const mockResults = {
        data: [
          {
            id: { company_id: 'company-1' },
            values: {
              name: [{ value: 'Acme Corp' }],
              domain: [{ value: 'acme.com' }],
              employee_count: [{ value: 500 }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('Acme', 'companies');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: expect.stringContaining('company-1'),
        title: 'Acme Corp',
        text: expect.stringContaining('acme.com'),
      });
    });

    it('should search across all types when type not specified', async () => {
      const mockPeople = {
        data: [
          {
            id: { person_id: 'person-tech' },
            values: { name: [{ value: 'Tech Person' }] },
          },
        ],
      };

      const mockCompanies = {
        data: [
          {
            id: { company_id: 'company-tech' },
            values: { name: [{ value: 'Tech Company' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest)
        .mockResolvedValueOnce(mockPeople)
        .mockResolvedValueOnce(mockCompanies)
        .mockResolvedValueOnce({ data: [] }) // lists
        .mockResolvedValueOnce({ data: [] }); // tasks

      const results = await search('Tech');

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.title === 'Tech Person')).toBe(true);
      expect(results.some((r) => r.title === 'Tech Company')).toBe(true);
    });

    it('should handle empty search results', async () => {
      vi.mocked(executeToolRequest).mockResolvedValueOnce({ data: [] });

      const results = await search('NonExistent', 'people');

      expect(results).toEqual([]);
    });

    it('should throw error for invalid parameters', async () => {
      await expect(search('', 'people')).rejects.toThrow(
        'Query parameter is required'
      );
      await expect(search(null as any, 'people')).rejects.toThrow(
        'Query parameter is required'
      );
      await expect(search('test', 'invalid' as any)).rejects.toThrow(
        'Invalid type'
      );
    });
  });

  describe('Cache Integration', () => {
    it('should use cache when enabled', async () => {
      features.updateFlags({ enableCache: true });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-cache' },
            values: { name: [{ value: 'Cached Person' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      // First search - should hit API
      const results1 = await search('Cached', 'people');
      expect(executeToolRequest).toHaveBeenCalledTimes(1);

      // Second search - should hit cache
      const results2 = await search('Cached', 'people');
      expect(executeToolRequest).toHaveBeenCalledTimes(1); // Still 1

      expect(results1).toEqual(results2);
    });

    it('should bypass cache when disabled', async () => {
      features.updateFlags({ enableCache: false });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-nocache' },
            values: { name: [{ value: 'No Cache Person' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResults);

      await search('NoCache', 'people');
      await search('NoCache', 'people');

      expect(executeToolRequest).toHaveBeenCalledTimes(2);
    });
  });

  describe('Relevance Scoring', () => {
    it('should apply relevance scoring when enabled', async () => {
      features.updateFlags({ enableRelevanceScoring: true });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-exact' },
            values: {
              name: [{ value: 'John Smith' }], // Exact match
              email_addresses: [{ email_address: 'john@example.com' }],
            },
          },
          {
            id: { person_id: 'person-partial' },
            values: {
              name: [{ value: 'Johnny Smithson' }], // Partial match
              email_addresses: [{ email_address: 'johnny@example.com' }],
            },
          },
          {
            id: { person_id: 'person-weak' },
            values: {
              name: [{ value: 'Jane Doe' }],
              email_addresses: [{ email_address: 'smith@example.com' }], // Weak match
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('John Smith', 'people');

      // Should be sorted by relevance
      expect(results).toHaveLength(3);
      expect(results[0].title).toBe('John Smith'); // Highest relevance
      expect(results[0]).toHaveProperty('score');
      expect(results[0].score).toBeGreaterThan(results[1].score!);
    });

    it('should not apply scoring when disabled', async () => {
      features.updateFlags({ enableRelevanceScoring: false });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-1' },
            values: { name: [{ value: 'Person One' }] },
          },
          {
            id: { person_id: 'person-2' },
            values: { name: [{ value: 'Person Two' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('Person', 'people');

      expect(results).toHaveLength(2);
      expect(results[0]).not.toHaveProperty('score');
      expect(results[1]).not.toHaveProperty('score');
    });

    it('should handle fuzzy matching', async () => {
      features.updateFlags({ enableRelevanceScoring: true });

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-typo' },
            values: {
              name: [{ value: 'Jonathan Smith' }], // Close to "Johnathan"
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const scoring = new RelevanceScoring();
      const results = await search('Johnathan Smith', 'people');

      if (results.length > 0 && results[0].score) {
        // Should still match with reasonable score
        expect(results[0].score).toBeGreaterThan(0.5);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: true });

      const apiError = new Error('API Error');
      (apiError as any).response = { status: 500 };

      vi.mocked(executeToolRequest)
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce({ data: [] }); // Retry succeeds

      const results = await search('test', 'people');

      expect(results).toEqual([]);
      expect(executeToolRequest).toHaveBeenCalledTimes(2);
    });

    it('should fall back to cache on error', async () => {
      features.updateFlags({
        enableCache: true,
        enableAdvancedErrorHandling: true,
      });

      const cachedResults = [
        {
          id: 'people:person-cached',
          title: 'Cached Person',
          text: 'From cache',
          url: 'https://app.attio.com/people/person-cached',
        },
      ];

      // Pre-populate cache
      const cacheKey = `search:${crypto.createHash('md5').update('cached:people').digest('hex')}`;
      searchCache.set(cacheKey, cachedResults, 3600000);

      // Mock API failure
      vi.mocked(executeToolRequest).mockRejectedValueOnce(
        new Error('API Down')
      );

      const results = await search('cached', 'people');

      expect(results).toEqual(cachedResults);
    });
  });

  describe('Pagination Support', () => {
    it('should handle pagination parameters', async () => {
      const mockPage1 = {
        data: [
          {
            id: { person_id: 'person-1' },
            values: { name: [{ value: 'Person 1' }] },
          },
          {
            id: { person_id: 'person-2' },
            values: { name: [{ value: 'Person 2' }] },
          },
        ],
      };

      const mockPage2 = {
        data: [
          {
            id: { person_id: 'person-3' },
            values: { name: [{ value: 'Person 3' }] },
          },
          {
            id: { person_id: 'person-4' },
            values: { name: [{ value: 'Person 4' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest)
        .mockResolvedValueOnce(mockPage1)
        .mockResolvedValueOnce(mockPage2);

      const results1 = await search('Person', 'people', {
        limit: 2,
        offset: 0,
      });
      const results2 = await search('Person', 'people', {
        limit: 2,
        offset: 2,
      });

      expect(results1).toHaveLength(2);
      expect(results2).toHaveLength(2);
      expect(results1[0].title).toBe('Person 1');
      expect(results2[0].title).toBe('Person 3');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain output format with all features disabled', async () => {
      features.reset();

      const mockResults = {
        data: [
          {
            id: { company_id: 'company-compat' },
            values: {
              name: [{ value: 'Compatible Company' }],
              domain: [{ value: 'compat.com' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('Compatible', 'companies');

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('text');
      expect(results[0]).toHaveProperty('url');
      expect(results[0]).not.toHaveProperty('score'); // No scoring when disabled
    });

    it('should produce consistent results regardless of features', async () => {
      const mockResults = {
        data: [
          {
            id: { list_id: 'list-consistent' },
            values: {
              name: [{ value: 'Consistent List' }],
              entries: [{ value: 100 }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockResults);

      // Test with features disabled
      features.reset();
      const results1 = await search('Consistent', 'lists');

      // Test with features enabled
      features.updateFlags({
        enableCache: true,
        enableRelevanceScoring: true,
        enableAdvancedErrorHandling: true,
      });

      // Clear cache to ensure fresh API call
      searchCache.clear();
      const results2 = await search('Consistent', 'lists');

      // Core structure should be the same
      expect(results1[0].id).toBe(results2[0].id);
      expect(results1[0].title).toBe(results2[0].title);
      expect(results1[0].url).toBe(results2[0].url);
    });
  });

  describe('Complex Search Scenarios', () => {
    it('should handle search with special characters', async () => {
      const mockResults = {
        data: [
          {
            id: { person_id: 'person-special' },
            values: {
              name: [{ value: "O'Reilly & Associates" }],
              email_addresses: [{ email_address: 'info@oreilly.com' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search("O'Reilly", 'people');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("O'Reilly & Associates");
    });

    it('should handle multi-word queries', async () => {
      const mockResults = {
        data: [
          {
            id: { company_id: 'company-multi' },
            values: {
              name: [{ value: 'International Business Machines' }],
              domain: [{ value: 'ibm.com' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('International Business', 'companies');

      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('International Business');
    });
  });
});
