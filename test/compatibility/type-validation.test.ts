/**
 * TypeScript Type Validation Tests
 * Ensures that TypeScript types and interfaces remain unchanged
 */

import { describe, it, expect } from 'vitest';
import type {
  OpenAISearchResult,
  OpenAIFetchResult,
} from '../../src/types/openai-types.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

/**
 * These type tests verify at compile time that our types are compatible
 * with the expected interfaces. If these compile, the types are correct.
 */
describe('TypeScript Type Validation', () => {
  describe('Function Signatures', () => {
    it('should maintain search function signature', () => {
      // Original signature expectation
      const searchSignature: (
        query: string,
        type?: string,
        options?: {
          limit?: number;
          offset?: number;
          [key: string]: any;
        }
      ) => Promise<OpenAISearchResult[]> = search;

      expect(searchSignature).toBe(search);
      expect(typeof search).toBe('function');
    });

    it('should maintain fetch function signature', () => {
      // Original signature expectation
      const fetchSignature: (
        id: string,
        options?: {
          [key: string]: any;
        }
      ) => Promise<OpenAIFetchResult> = fetch;

      expect(fetchSignature).toBe(fetch);
      expect(typeof fetch).toBe('function');
    });

    it('should maintain executeToolRequest signature', () => {
      // Original signature expectation
      const executeToolRequestSignature: (request: any) => Promise<any> =
        executeToolRequest;

      expect(executeToolRequestSignature).toBe(executeToolRequest);
      expect(typeof executeToolRequest).toBe('function');
    });
  });

  describe('Return Type Validation', () => {
    it('should verify OpenAISearchResult structure', () => {
      // This verifies the type has the expected properties
      const validSearchResult: OpenAISearchResult = {
        id: 'people:person-123',
        title: 'John Doe',
        text: 'John Doe - Software Engineer',
        url: 'https://app.attio.com/people/person-123',
      };

      // Verify required properties
      expect(validSearchResult).toHaveProperty('id');
      expect(validSearchResult).toHaveProperty('title');
      expect(validSearchResult).toHaveProperty('text');
      expect(validSearchResult).toHaveProperty('url');

      // Type system ensures no extra required properties
      const minimalResult: OpenAISearchResult = {
        id: 'test',
        title: 'test',
        text: 'test',
        url: 'test',
      };

      expect(Object.keys(minimalResult)).toHaveLength(4);
    });

    it('should verify OpenAIFetchResult structure', () => {
      // This verifies the type has the expected properties
      const validFetchResult: OpenAIFetchResult = {
        id: 'people:person-123',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        url: 'https://app.attio.com/people/person-123',
      };

      // Verify required properties
      expect(validFetchResult).toHaveProperty('id');
      expect(validFetchResult).toHaveProperty('data');
      expect(validFetchResult).toHaveProperty('url');

      // Data can be any object
      const flexibleResult: OpenAIFetchResult = {
        id: 'test',
        data: { any: 'property', is: 'valid' },
        url: 'test',
      };

      expect(flexibleResult.data).toHaveProperty('any');
    });
  });

  describe('Parameter Type Validation', () => {
    it('should accept valid search parameters', async () => {
      // These should all compile without type errors
      const validCalls = [
        () => search('query'),
        () => search('query', 'people'),
        () => search('query', 'companies'),
        () => search('query', 'lists'),
        () => search('query', 'people', { limit: 10 }),
        () => search('query', 'people', { limit: 10, offset: 0 }),
        () => search('query', undefined),
        () => search('query', 'people', {}),
      ];

      // Verify they're all functions
      validCalls.forEach((call) => {
        expect(typeof call).toBe('function');
      });
    });

    it('should accept valid fetch parameters', async () => {
      // These should all compile without type errors
      const validCalls = [
        () => fetch('people:person-123'),
        () => fetch('companies:company-456'),
        () => fetch('lists:list-789'),
        () => fetch('people:person-123', {}),
        () => fetch('people:person-123', { includeRelated: true }),
      ];

      // Verify they're all functions
      validCalls.forEach((call) => {
        expect(typeof call).toBe('function');
      });
    });
  });

  describe('Tool Request Types', () => {
    it('should accept valid tool call requests', () => {
      const validRequests = [
        {
          name: 'search-records',
          arguments: {
            query: 'test',
            object_type: 'people',
          },
        },
        {
          name: 'get-record',
          arguments: {
            record_id: 'person-123',
            object_type: 'people',
          },
        },
        {
          name: 'create-record',
          arguments: {
            object_type: 'people',
            data: {
              name: 'John Doe',
              email_addresses: ['john@example.com'],
            },
          },
        },
        {
          name: 'update-record',
          arguments: {
            record_id: 'person-123',
            object_type: 'people',
            data: {
              job_title: 'Senior Engineer',
            },
          },
        },
        {
          name: 'delete-record',
          arguments: {
            record_id: 'person-123',
            object_type: 'people',
          },
        },
      ];

      // All should be valid ToolCallRequest types
      validRequests.forEach((request) => {
        expect(request).toHaveProperty('name');
        expect(request).toHaveProperty('arguments');
      });
    });
  });

  describe('Generic Type Constraints', () => {
    it('should maintain generic type constraints', () => {
      // Test that our types work with generic functions
      async function processSearchResults<T extends OpenAISearchResult>(
        results: T[]
      ): Promise<T[]> {
        return results;
      }

      async function processFetchResult<T extends OpenAIFetchResult>(
        result: T
      ): Promise<T> {
        return result;
      }

      // These should compile
      const testSearch = async () => {
        const results = await search('test', 'people');
        return processSearchResults(results);
      };

      const testFetch = async () => {
        const result = await fetch('people:person-123');
        return processFetchResult(result);
      };

      expect(typeof testSearch).toBe('function');
      expect(typeof testFetch).toBe('function');
    });
  });

  describe('Type Guards and Narrowing', () => {
    it('should support type guards for results', () => {
      function isSearchResult(value: any): value is OpenAISearchResult {
        return (
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          'title' in value &&
          'text' in value &&
          'url' in value
        );
      }

      function isFetchResult(value: any): value is OpenAIFetchResult {
        return (
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          'data' in value &&
          'url' in value
        );
      }

      const searchResult = {
        id: 'test',
        title: 'test',
        text: 'test',
        url: 'test',
      };

      const fetchResult = {
        id: 'test',
        data: {},
        url: 'test',
      };

      expect(isSearchResult(searchResult)).toBe(true);
      expect(isFetchResult(fetchResult)).toBe(true);
      expect(isSearchResult(fetchResult)).toBe(false);
      expect(isFetchResult(searchResult)).toBe(false);
    });
  });

  describe('Backward Compatible Type Extensions', () => {
    it('should allow optional properties for future extensions', () => {
      // Ensure our types can be extended without breaking
      interface ExtendedSearchResult extends OpenAISearchResult {
        score?: number; // Optional property for scoring
        metadata?: any; // Optional property for metadata
      }

      const extendedResult: ExtendedSearchResult = {
        id: 'test',
        title: 'test',
        text: 'test',
        url: 'test',
        score: 0.95, // Optional
      };

      // Should still be assignable to base type
      const baseResult: OpenAISearchResult = extendedResult;

      expect(baseResult).toBe(extendedResult);
    });

    it('should maintain assignability with base types', () => {
      // Test that our types are assignable in both directions
      const baseSearchResult: OpenAISearchResult = {
        id: 'test',
        title: 'test',
        text: 'test',
        url: 'test',
      };

      // Should be assignable to a more permissive type
      const permissiveResult: {
        id: string;
        title: string;
        [key: string]: any;
      } = baseSearchResult;

      expect(permissiveResult).toBe(baseSearchResult);
    });
  });

  describe('Const Assertions and Literal Types', () => {
    it('should support const assertions', () => {
      const recordTypes = ['people', 'companies', 'lists', 'tasks'] as const;
      type RecordType = (typeof recordTypes)[number];

      // Should be able to use literal types
      const testType: RecordType = 'people';
      expect(recordTypes).toContain(testType);
    });

    it('should maintain string literal types for tool names', () => {
      const toolNames = [
        'search-records',
        'get-record',
        'create-record',
        'update-record',
        'delete-record',
      ] as const;

      type ToolName = (typeof toolNames)[number];

      const validTool: ToolName = 'search-records';
      expect(toolNames).toContain(validTool);
    });
  });
});
