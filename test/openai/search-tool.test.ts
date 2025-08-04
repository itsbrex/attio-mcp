/**
 * Unit tests for OpenAI Search Tool
 */

import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { OpenAISearchTool } from '../../src/openai/search-tool.js';
import { OpenAIDataTransformer } from '../../src/openai/data-transformer.js';
import { OpenAIRelevanceScorer } from '../../src/openai/relevance-scorer.js';
import { searchObject, advancedSearchObject } from '../../src/api/operations/search.js';
import { ResourceType } from '../../src/types/attio.js';

// Mock the API operations
vi.mock('../../src/api/operations/search.js', () => ({
  searchObject: vi.fn(),
  advancedSearchObject: vi.fn(),
}));

// Mock console methods
vi.mock('console', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockSearchObject = searchObject as MockedFunction<typeof searchObject>;
const mockAdvancedSearchObject = advancedSearchObject as MockedFunction<typeof advancedSearchObject>;

describe('OpenAISearchTool', () => {
  let searchTool: OpenAISearchTool;
  let mockTransformer: OpenAIDataTransformer;
  let mockRelevanceScorer: OpenAIRelevanceScorer;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockTransformer = new OpenAIDataTransformer();
    mockRelevanceScorer = new OpenAIRelevanceScorer();
    
    // Mock transformer methods
    vi.spyOn(mockTransformer, 'transformToSearchResult').mockImplementation((record, query, objectType) => ({
      id: record.id || 'test-id',
      title: record.values?.name?.value || 'Test Title',
      text: `Test content for ${objectType}`,
      url: `https://app.attio.com/${objectType}/test-id`,
    }));

    // Mock relevance scorer
    vi.spyOn(mockRelevanceScorer, 'calculateRelevance').mockResolvedValue(0.8);

    searchTool = new OpenAISearchTool(mockTransformer, mockRelevanceScorer);
  });

  describe('search', () => {
    it('should successfully search and return results', async () => {
      // Arrange
      const mockRecords = [
        {
          id: 'person-1',
          values: {
            name: { value: 'John Doe' },
            email_addresses: { value: ['john@example.com'] },
          },
        },
        {
          id: 'company-1',
          values: {
            name: { value: 'Acme Corp' },
            domain: { value: 'acme.com' },
          },
        },
      ];

      mockSearchObject.mockResolvedValue(mockRecords);

      // Act
      const result = await searchTool.search('test query');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0]).toMatchObject({
        id: 'person-1',
        title: 'John Doe',
        url: expect.stringContaining('person-1'),
      });
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.searchTime).toBeGreaterThan(0);
      expect(result.context.query).toBe('test query');
    });

    it('should handle empty search query', async () => {
      // Act
      const result = await searchTool.search('');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SEARCH_ERROR');
      expect(result.error?.message).toContain('empty');
    });

    it('should handle search query that is too long', async () => {
      // Arrange
      const longQuery = 'a'.repeat(501);

      // Act
      const result = await searchTool.search(longQuery);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SEARCH_ERROR');
      expect(result.error?.message).toContain('too long');
    });

    it('should apply search options correctly', async () => {
      // Arrange
      const mockRecords = [
        {
          id: 'person-1',
          values: { name: { value: 'John Doe' } },
        },
      ];

      mockSearchObject.mockResolvedValue(mockRecords);

      const options = {
        limit: 5,
        types: ['people'],
        minRelevance: 0.5,
      };

      // Act
      const result = await searchTool.search('test query', options);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSearchObject).toHaveBeenCalledWith(ResourceType.PEOPLE, 'test query');
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockSearchObject.mockRejectedValue(new Error('API Error'));

      // Act
      const result = await searchTool.search('test query');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SEARCH_ERROR');
      expect(result.error?.message).toContain('API Error');
    });

    it('should filter results by minimum relevance', async () => {
      // Arrange
      const mockRecords = [
        { id: 'high-relevance', values: { name: { value: 'Highly Relevant' } } },
        { id: 'low-relevance', values: { name: { value: 'Low Relevance' } } },
      ];

      mockSearchObject.mockResolvedValue(mockRecords);
      
      // Mock different relevance scores
      vi.spyOn(mockRelevanceScorer, 'calculateRelevance')
        .mockResolvedValueOnce(0.9) // High relevance
        .mockResolvedValueOnce(0.2); // Low relevance

      const options = { minRelevance: 0.5 };

      // Act
      const result = await searchTool.search('test query', options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('high-relevance');
    });

    it('should search multiple object types', async () => {
      // Arrange
      const peopleRecords = [{ id: 'person-1', values: { name: { value: 'John' } } }];
      const companyRecords = [{ id: 'company-1', values: { name: { value: 'Acme' } } }];

      mockSearchObject
        .mockResolvedValueOnce(peopleRecords)
        .mockResolvedValueOnce(companyRecords);

      const options = { types: ['people', 'companies'] };

      // Act
      const result = await searchTool.search('test query', options);

      // Assert
      expect(result.success).toBe(true);
      expect(mockSearchObject).toHaveBeenCalledTimes(2);
      expect(mockSearchObject).toHaveBeenCalledWith(ResourceType.PEOPLE, 'test query');
      expect(mockSearchObject).toHaveBeenCalledWith(ResourceType.COMPANIES, 'test query');
    });

    it('should use advanced search for complex queries', async () => {
      // Arrange
      const mockRecords = [{ id: 'test-1', values: { name: { value: 'Test' } } }];
      mockAdvancedSearchObject.mockResolvedValue(mockRecords);

      // Complex query with quotes
      const complexQuery = '"John Doe" AND company:Acme';

      // Act
      const result = await searchTool.search(complexQuery);

      // Assert
      expect(result.success).toBe(true);
      expect(mockAdvancedSearchObject).toHaveBeenCalled();
    });

    it('should continue searching other types if one fails', async () => {
      // Arrange
      const companyRecords = [{ id: 'company-1', values: { name: { value: 'Acme' } } }];

      mockSearchObject
        .mockRejectedValueOnce(new Error('People search failed'))
        .mockResolvedValueOnce(companyRecords);

      const options = { types: ['people', 'companies'] };

      // Act
      const result = await searchTool.search('test query', options);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].id).toBe('company-1');
    });
  });

  describe('mapToResourceType', () => {
    it('should map object types correctly', async () => {
      // Test different object type mappings
      const testCases = [
        { input: 'people', expected: ResourceType.PEOPLE },
        { input: 'person', expected: ResourceType.PEOPLE },
        { input: 'companies', expected: ResourceType.COMPANIES },
        { input: 'company', expected: ResourceType.COMPANIES },
        { input: 'lists', expected: ResourceType.LISTS },
        { input: 'list', expected: ResourceType.LISTS },
        { input: 'tasks', expected: ResourceType.TASKS },
        { input: 'task', expected: ResourceType.TASKS },
      ];

      for (const testCase of testCases) {
        mockSearchObject.mockResolvedValue([]);
        
        await searchTool.search('test', { types: [testCase.input] });
        
        expect(mockSearchObject).toHaveBeenCalledWith(testCase.expected, 'test');
        mockSearchObject.mockClear();
      }
    });

    it('should throw error for unsupported object type', async () => {
      // Act & Assert
      const result = await searchTool.search('test', { types: ['unsupported'] });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unsupported object type');
    });
  });

  describe('isSimpleQuery', () => {
    it('should identify simple queries correctly', async () => {
      const simpleQueries = [
        'john doe',
        'acme corp',
        'single-word',
        'simple phrase here',
      ];

      const complexQueries = [
        '"John Doe" AND company:Acme',
        'john OR jane',
        'NOT inactive',
        'created:2023',
        'status:active',
      ];

      // Test simple queries use searchObject
      for (const query of simpleQueries) {
        mockSearchObject.mockResolvedValue([]);
        await searchTool.search(query);
        expect(mockSearchObject).toHaveBeenCalled();
        mockSearchObject.mockClear();
      }

      // Test complex queries use advancedSearchObject
      for (const query of complexQueries) {
        mockAdvancedSearchObject.mockResolvedValue([]);
        await searchTool.search(query);
        expect(mockAdvancedSearchObject).toHaveBeenCalled();
        mockAdvancedSearchObject.mockClear();
      }
    });
  });
});