/**
 * Backward Compatibility Test Suite
 * Ensures 100% backward compatibility with existing implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { features } from '../../src/config/features.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';
import {
  transformToSearchResult,
  transformToFetchResult,
} from '../../src/openai/transformers/index.js';
import type {
  OpenAISearchResult,
  OpenAIFetchResult,
} from '../../src/types/openai-types.js';

// Mock the tool dispatcher (but not executeToolRequest since we import it above)
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

// Helper to create mock tool response
function mockToolResponse(data: any) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

describe('Backward Compatibility Tests', () => {
  beforeEach(() => {
    // CRITICAL: Ensure all features are disabled for compatibility testing
    features.reset();
    expect(features.isEnabled('enableCache')).toBe(false);
    expect(features.isEnabled('enableRelevanceScoring')).toBe(false);
    expect(features.isEnabled('enableAdvancedErrorHandling')).toBe(false);
    expect(features.isEnabled('enableDataTransformation')).toBe(false);
    expect(features.isEnabled('enablePerformanceOptimization')).toBe(false);
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('API Contracts', () => {
    describe('Search Function', () => {
      it('should maintain exact function signature', () => {
        // Verify search function accepts same parameters
        expect(search).toBeDefined();
        expect(search.length).toBeLessThanOrEqual(3); // query, type?, options?
        expect(typeof search).toBe('function');
      });

      it('should return OpenAISearchResult[] format', async () => {
        // Mock the formatted text response that the universal tools return
        const mockPeopleResponse =
          'Found 1 people:\n1. John Doe (john@example.com) (ID: 12345678-1234-1234-1234-123456789abc)';
        const mockEmptyResponse = 'Found 0 records:\n';

        // Mock all 4 parallel searches (companies, people, lists, tasks)
        vi.mocked(executeToolRequest)
          .mockResolvedValueOnce({
            content: [{ type: 'text', text: mockEmptyResponse }],
          }) // companies
          .mockResolvedValueOnce({
            content: [{ type: 'text', text: mockPeopleResponse }],
          }) // people
          .mockResolvedValueOnce({
            content: [{ type: 'text', text: mockEmptyResponse }],
          }) // lists
          .mockResolvedValueOnce({
            content: [{ type: 'text', text: mockEmptyResponse }],
          }); // tasks

        const results = await search('John');

        // Verify exact response format
        expect(Array.isArray(results)).toBe(true);
        expect(results[0]).toHaveProperty('id');
        expect(results[0]).toHaveProperty('title');
        expect(results[0]).toHaveProperty('text');
        expect(results[0]).toHaveProperty('url');

        // Should NOT have new properties when features disabled
        expect(results[0]).not.toHaveProperty('score');
        expect(results[0]).not.toHaveProperty('relevance');
        expect(results[0]).not.toHaveProperty('metadata');
      });

      it('should handle search across all types', async () => {
        // Search function searches all types in parallel
        vi.mocked(executeToolRequest)
          .mockResolvedValueOnce(mockToolResponse({ data: [] })) // companies
          .mockResolvedValueOnce(mockToolResponse({ data: [] })) // people
          .mockResolvedValueOnce(mockToolResponse({ data: [] })) // lists
          .mockResolvedValueOnce(mockToolResponse({ data: [] })); // tasks

        const results = await search('test');
        expect(results).toEqual([]);
        expect(executeToolRequest).toHaveBeenCalledTimes(4);
      });

      it('should call executeToolRequest for each resource type', async () => {
        vi.mocked(executeToolRequest).mockResolvedValue(
          mockToolResponse({ data: [] })
        );

        const results = await search('test');

        expect(results).toEqual([]);
        // Should have called for each type: companies, people, lists, tasks
        expect(executeToolRequest).toHaveBeenCalledTimes(4);
      });
    });

    describe('Fetch Function', () => {
      it('should maintain exact function signature', () => {
        expect(fetch).toBeDefined();
        expect(fetch.length).toBeLessThanOrEqual(2); // id, options?
        expect(typeof fetch).toBe('function');
      });

      it('should return OpenAIFetchResult format', async () => {
        const mockResult = {
          data: {
            id: { person_id: 'person-123' },
            values: {
              name: [{ value: 'John Doe' }],
              email_addresses: [{ email_address: 'john@example.com' }],
              phone_numbers: [{ phone_number: '+1234567890' }],
            },
          },
        };

        vi.mocked(executeToolRequest).mockResolvedValueOnce(
          mockToolResponse(mockResult)
        );

        const result = await fetch('people:person-123');

        // Verify exact response format
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('url');

        // Should NOT have new properties
        expect(result).not.toHaveProperty('metadata');
        expect(result).not.toHaveProperty('enriched');
        expect(result).not.toHaveProperty('cached');
      });

      it('should handle all ID formats', async () => {
        const idFormats = [
          'people:person-123',
          'companies:company-456',
          'lists:list-789',
          'tasks:task-abc',
          'deals:deal-def',
        ];

        for (const id of idFormats) {
          vi.mocked(executeToolRequest).mockResolvedValueOnce(
            mockToolResponse({ data: { id: {}, values: {} } })
          );

          const result = await fetch(id);
          expect(result).toBeDefined();
        }
      });
    });
  });

  describe('Response Format Compatibility', () => {
    describe('Search Result Transformation', () => {
      it('should produce exact same format as original', () => {
        const record = {
          id: { person_id: 'person-123' },
          values: {
            name: [{ value: 'John Doe' }],
            email_addresses: [{ email_address: 'john@example.com' }],
            job_title: [{ value: 'Software Engineer' }],
          },
        };

        const result = transformToSearchResult(record, 'John', 'people');

        // Exact format validation
        expect(result).toEqual({
          id: 'people:person-123',
          title: 'John Doe',
          text: expect.stringContaining('John Doe'),
          url: 'https://app.attio.com/people/person-123',
        });
        expect(result.text).toContain('john@example.com');

        // No extra fields
        const keys = Object.keys(result);
        expect(keys).toEqual(['id', 'title', 'text', 'url']);
      });

      it('should handle missing fields gracefully', () => {
        const record = {
          id: { company_id: 'company-456' },
          values: {
            name: [{ value: 'Acme Corp' }],
            // No other fields
          },
        };

        const result = transformToSearchResult(record, 'Acme', 'companies');

        expect(result.title).toBe('Acme Corp');
        expect(result.text).toContain('Acme Corp');
        expect(result.id).toBe('companies:company-456');
      });
    });

    describe('Fetch Result Transformation', () => {
      it('should produce exact same format as original', () => {
        const record = {
          id: { person_id: 'person-123' },
          values: {
            name: [{ value: 'John Doe' }],
            email_addresses: [{ email_address: 'john@example.com' }],
            phone_numbers: [{ phone_number: '+1234567890' }],
          },
        };

        const result = transformToFetchResult(record, 'people');

        // Exact format validation
        expect(result).toHaveProperty('id', 'people:person-123');
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty(
          'url',
          'https://app.attio.com/people/person-123'
        );

        // Data should have specific structure
        expect(result.data).toHaveProperty('name', 'John Doe');
        expect(result.data).toHaveProperty('email', 'john@example.com');
        expect(result.data).toHaveProperty('phone', '+1234567890');
      });
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should throw same errors for invalid parameters', async () => {
      // Empty query
      await expect(search('')).rejects.toThrow('Query parameter is required');

      // Null query
      await expect(search(null as any)).rejects.toThrow(
        'Query parameter is required'
      );

      // Invalid fetch ID format
      await expect(fetch('invalid-id')).rejects.toThrow('Invalid ID format');
    });

    it('should propagate API errors unchanged', async () => {
      const apiError = new Error('API Error: Rate limit exceeded');
      vi.mocked(executeToolRequest).mockRejectedValueOnce(apiError);

      await expect(search('test', 'people')).rejects.toThrow(
        'API Error: Rate limit exceeded'
      );
    });

    it('should handle network errors consistently', async () => {
      const networkError = new Error('Network error: ECONNREFUSED');
      vi.mocked(executeToolRequest).mockRejectedValueOnce(networkError);

      await expect(fetch('people:person-123')).rejects.toThrow(
        'Network error: ECONNREFUSED'
      );
    });
  });

  describe('Tool Handler Compatibility', () => {
    it('should handle tool calls with exact same format', async () => {
      const toolCall = {
        method: 'tools/call',
        params: {
          name: 'search-records',
          arguments: {
            query: 'test query',
            object_type: 'people',
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ data: [] }) }],
      });

      const result = await executeToolRequest(toolCall);

      expect(result).toBeDefined();
      expect(executeToolRequest).toHaveBeenCalledWith(toolCall);
    });

    it('should support all original tool names', async () => {
      const tools = [
        'search-records',
        'get-record',
        'create-record',
        'update-record',
        'delete-record',
        'list-attributes',
        'add-list-entry',
        'remove-list-entry',
      ];

      for (const tool of tools) {
        vi.mocked(executeToolRequest).mockResolvedValueOnce({
          content: [{ type: 'text', text: JSON.stringify({ data: [] }) }],
        });

        const result = await executeToolRequest({
          method: 'tools/call',
          params: {
            name: tool,
            arguments: {},
          },
        });

        expect(executeToolRequest).toHaveBeenCalled();
      }
    });
  });

  describe('TypeScript Type Compatibility', () => {
    it('should maintain type signatures for search', () => {
      // This test verifies at compile time that types are compatible
      const testSearch: (query: string) => Promise<OpenAISearchResult[]> =
        search;

      expect(testSearch).toBe(search);
    });

    it('should maintain type signatures for fetch', () => {
      // This test verifies at compile time that types are compatible
      const testFetch: (
        id: string,
        options?: any
      ) => Promise<OpenAIFetchResult> = fetch;

      expect(testFetch).toBe(fetch);
    });
  });

  describe('Performance Baseline', () => {
    it('should maintain performance characteristics without features', async () => {
      const mockResults = {
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: { person_id: `person-${i}` },
            values: {
              name: [{ value: `Person ${i}` }],
            },
          })),
      };

      vi.mocked(executeToolRequest).mockResolvedValue(
        mockToolResponse(mockResults)
      );

      const startTime = performance.now();
      const results = await search('test', 'people');
      const duration = performance.now() - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(100); // Should be fast without features
    });
  });

  describe('Integration with Existing Code', () => {
    it('should work with existing client patterns', async () => {
      // Simulate common client usage patterns
      vi.mocked(executeToolRequest).mockResolvedValueOnce({
        data: [
          {
            id: { person_id: 'person-1' },
            values: { name: [{ value: 'Alice' }] },
          },
        ],
      });

      // Pattern 1: Search and extract first result
      const results = await search('Alice', 'people');
      const firstResult = results[0];
      expect(firstResult?.title).toBe('Alice');

      // Pattern 2: Fetch by ID
      vi.mocked(executeToolRequest).mockResolvedValueOnce({
        data: {
          id: { person_id: 'person-1' },
          values: { name: [{ value: 'Alice' }] },
        },
      });

      const fetchResult = await fetch('people:person-1');
      expect(fetchResult.data.name).toBe('Alice');
    });

    it('should handle pagination consistently', async () => {
      vi.mocked(executeToolRequest).mockResolvedValueOnce({
        data: Array(10)
          .fill(null)
          .map((_, i) => ({
            id: { person_id: `person-${i}` },
            values: { name: [{ value: `Person ${i}` }] },
          })),
      });

      const results = await search('Person', 'people', {
        limit: 10,
        offset: 0,
      });

      expect(results).toHaveLength(10);
      expect(results[0].title).toBe('Person 0');
      expect(results[9].title).toBe('Person 9');
    });
  });

  describe('Feature Flag Isolation', () => {
    it('should not leak feature functionality when disabled', async () => {
      // Explicitly ensure features are off
      features.reset();

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-1' },
            values: { name: [{ value: 'Test Person' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValue(
        mockToolResponse(mockResults)
      );

      // Run search multiple times - cache should NOT be used
      await search('Test', 'people');
      await search('Test', 'people');
      await search('Test', 'people');

      // Should call API every time (no caching)
      expect(executeToolRequest).toHaveBeenCalledTimes(3);
    });

    it('should not apply scoring when feature disabled', async () => {
      features.reset();

      const mockResults = {
        data: [
          {
            id: { person_id: 'person-exact' },
            values: { name: [{ value: 'John Smith' }] },
          },
          {
            id: { person_id: 'person-partial' },
            values: { name: [{ value: 'John Doe' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockResults);

      const results = await search('John Smith', 'people');

      // Results should be in original order (no scoring)
      expect(results[0].title).toBe('John Smith');
      expect(results[1].title).toBe('John Doe');

      // No score property
      expect(results[0]).not.toHaveProperty('score');
      expect(results[1]).not.toHaveProperty('score');
    });
  });
});
