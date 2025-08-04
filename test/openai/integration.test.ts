/**
 * Integration tests for OpenAI Tools
 * Tests the complete flow with real-like data and mocked API calls
 */

import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { OpenAITools } from '../../src/openai/tools.js';
import { searchObject, advancedSearchObject } from '../../src/api/operations/search.js';
import { getAttioClient } from '../../src/api/attio-client.js';
import { callWithRetry } from '../../src/api/operations/retry.js';

// Mock dependencies
vi.mock('../../src/api/operations/search.js', () => ({
  searchObject: vi.fn(),
  advancedSearchObject: vi.fn(),
}));

vi.mock('../../src/api/attio-client.js', () => ({
  getAttioClient: vi.fn(),
}));

vi.mock('../../src/api/operations/retry.js', () => ({
  callWithRetry: vi.fn(),
}));

vi.mock('console', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockSearchObject = searchObject as MockedFunction<typeof searchObject>;
const mockAdvancedSearchObject = advancedSearchObject as MockedFunction<typeof advancedSearchObject>;
const mockGetAttioClient = getAttioClient as MockedFunction<typeof getAttioClient>;
const mockCallWithRetry = callWithRetry as MockedFunction<typeof callWithRetry>;

describe('OpenAI Tools Integration', () => {
  let openaiTools: OpenAITools;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API client
    mockApi = {
      get: vi.fn(),
      post: vi.fn(),
    };
    mockGetAttioClient.mockReturnValue(mockApi);

    // Mock callWithRetry to just execute the function
    mockCallWithRetry.mockImplementation(async (fn) => await fn());

    // Initialize OpenAI tools with test configuration
    openaiTools = new OpenAITools({
      baseUrl: 'https://test.attio.com',
      cache: { enabled: false }, // Disable cache for predictable tests
      debug: false,
    });
  });

  describe('End-to-End Search Flow', () => {
    it('should complete full search workflow successfully', async () => {
      // Arrange - Mock realistic Attio data
      const mockPeopleRecords = [
        {
          id: 'person-1',
          values: {
            name: { value: 'John Doe' },
            email_addresses: { value: ['john.doe@acme.com'] },
            job_title: { value: 'Software Engineer' },
            company: { value: { display_name: 'Acme Corp' } },
          },
        },
        {
          id: 'person-2',
          values: {
            name: { value: 'Jane Smith' },
            email_addresses: { value: ['jane.smith@acme.com'] },
            job_title: { value: 'Product Manager' },
            company: { value: { display_name: 'Acme Corp' } },
          },
        },
      ];

      const mockCompanyRecords = [
        {
          id: 'company-1',
          values: {
            name: { value: 'Acme Corporation' },
            domain: { value: 'acme.com' },
            industry: { value: { option: 'Technology' } },
            location: { value: 'San Francisco, CA' },
          },
        },
      ];

      mockSearchObject
        .mockResolvedValueOnce(mockPeopleRecords)
        .mockResolvedValueOnce(mockCompanyRecords)
        .mockResolvedValueOnce([]) // lists
        .mockResolvedValueOnce([]); // tasks

      // Act
      const result = await openaiTools.search('acme', {
        limit: 10,
        types: ['people', 'companies', 'lists', 'tasks'],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3); // 2 people + 1 company
      
      // Verify people results
      const johnResult = result.data!.find(r => r.id === 'person-1');
      expect(johnResult).toMatchObject({
        id: 'person-1',
        title: 'John Doe',
        url: 'https://test.attio.com/people/person-1',
      });
      expect(johnResult!.text).toContain('Software Engineer');
      expect(johnResult!.text).toContain('john.doe@acme.com');

      // Verify company result
      const companyResult = result.data!.find(r => r.id === 'company-1');
      expect(companyResult).toMatchObject({
        id: 'company-1',
        title: 'Acme Corporation',
        url: 'https://test.attio.com/companies/company-1',
      });
      expect(companyResult!.text).toContain('acme.com');
      expect(companyResult!.text).toContain('Technology');

      // Verify metrics
      expect(result.metrics).toMatchObject({
        resultCount: 3,
        objectsSearched: 4,
        wasCached: false,
      });

      // Verify all object types were searched
      expect(mockSearchObject).toHaveBeenCalledTimes(4);
    });

    it('should handle mixed success/failure across object types', async () => {
      // Arrange
      const mockPeopleRecords = [
        {
          id: 'person-1',
          values: { name: { value: 'John Doe' } },
        },
      ];

      mockSearchObject
        .mockResolvedValueOnce(mockPeopleRecords) // people succeeds
        .mockRejectedValueOnce(new Error('Company search failed')) // companies fails
        .mockResolvedValueOnce([]); // lists succeeds but empty

      // Act
      const result = await openaiTools.search('test', {
        types: ['people', 'companies', 'lists'],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1); // Only people result
      expect(result.data![0].id).toBe('person-1');
    });

    it('should apply relevance filtering correctly', async () => {
      // Arrange
      const mockRecords = [
        {
          id: 'high-relevance',
          values: { name: { value: 'Perfect Match Query' } },
        },
        {
          id: 'low-relevance',
          values: { name: { value: 'Barely Related' } },
        },
      ];

      mockSearchObject.mockResolvedValue(mockRecords);

      // Act
      const result = await openaiTools.search('Perfect Match Query', {
        minRelevance: 0.7,
        types: ['people'],
      });

      // Assert
      expect(result.success).toBe(true);
      // Results should be filtered by relevance (mocked in relevance scorer)
      expect(result.data!.length).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Fetch Flow', () => {
    it('should complete full fetch workflow successfully', async () => {
      // Arrange
      const mockRecord = {
        id: 'person-123',
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: ['john@example.com', 'john.doe@work.com'] },
          phone_numbers: { value: ['+1234567890'] },
          job_title: { value: 'Senior Developer' },
          company: { value: { display_name: 'Tech Corp' } },
          created_at: { value: '2023-01-15T10:00:00Z' },
          updated_at: { value: '2024-01-10T15:30:00Z' },
        },
      };

      mockApi.get.mockResolvedValue({
        data: { data: mockRecord },
      });

      // Act
      const result = await openaiTools.fetch('person-123', {
        includeRelated: true,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'person-123',
        title: 'John Doe',
        url: 'https://test.attio.com/people/person-123',
      });

      // Verify detailed content
      expect(result.data!.text).toContain('John Doe');
      expect(result.data!.text).toContain('john@example.com, john.doe@work.com');
      expect(result.data!.text).toContain('+1234567890');
      expect(result.data!.text).toContain('Senior Developer');
      expect(result.data!.text).toContain('Tech Corp');
      expect(result.data!.text).toContain('Created:');
      expect(result.data!.text).toContain('Last Updated:');

      // Verify metadata
      expect(result.data!.metadata).toMatchObject({
        objectType: expect.any(String),
        recordId: 'person-123',
        hasEmail: true,
        hasPhone: true,
        hasJobTitle: true,
        hasCompany: true,
      });

      expect(result.metrics!.resultCount).toBe(1);
    });

    it('should try multiple object types for fetch', async () => {
      // Arrange
      const mockRecord = {
        id: 'record-456',
        values: { name: { value: 'Found Record' } },
      };

      // First API call returns 404, second succeeds
      mockApi.get
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: { data: mockRecord } });

      // Act
      const result = await openaiTools.fetch('record-456');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('record-456');
      expect(mockApi.get).toHaveBeenCalledTimes(2);
    });

    it('should handle fetch not found across all object types', async () => {
      // Arrange
      mockApi.get.mockRejectedValue({ response: { status: 404 } });

      // Act
      const result = await openaiTools.fetch('nonexistent-id');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FETCH_ERROR');
      expect(result.error?.message).toContain('not found in any object type');
      
      // Should have tried multiple object types
      expect(mockApi.get).toHaveBeenCalledTimes(4); // Default order: people, companies, lists, tasks
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle API authentication errors', async () => {
      // Arrange
      mockSearchObject.mockRejectedValue({
        response: { status: 401, data: { error: 'Unauthorized' } },
      });

      // Act
      const result = await openaiTools.search('test query');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SEARCH_ERROR');
      expect(result.metrics!.resultCount).toBe(0);
    });

    it('should handle network timeouts', async () => {
      // Arrange
      mockSearchObject.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded',
      });

      // Act
      const result = await openaiTools.search('test query');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SEARCH_ERROR');
    });

    it('should handle malformed API responses', async () => {
      // Arrange
      mockSearchObject.mockResolvedValue([
        { id: 'valid-record', values: { name: { value: 'Valid' } } },
        { id: 'invalid-record' }, // Missing values
        null, // Null record
      ]);

      // Act
      const result = await openaiTools.search('test');

      // Assert
      expect(result.success).toBe(true);
      // Should handle malformed records gracefully
      expect(result.data!.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Metrics', () => {
    it('should track accurate performance metrics', async () => {
      // Arrange
      const mockRecords = Array.from({ length: 15 }, (_, i) => ({
        id: `record-${i}`,
        values: { name: { value: `Record ${i}` } },
      }));

      mockSearchObject.mockImplementation(async () => {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 50));
        return mockRecords;
      });

      // Act
      const startTime = Date.now();
      const result = await openaiTools.search('test', { types: ['people'] });
      const endTime = Date.now();

      // Assert
      expect(result.success).toBe(true);
      expect(result.metrics!.searchTime).toBeGreaterThan(40); // Should account for delay
      expect(result.metrics!.searchTime).toBeLessThan(endTime - startTime + 100); // Reasonable upper bound
      expect(result.metrics!.resultCount).toBe(15);
      expect(result.metrics!.objectsSearched).toBe(1);
    });

    it('should handle large result sets efficiently', async () => {
      // Arrange
      const mockRecords = Array.from({ length: 100 }, (_, i) => ({
        id: `record-${i}`,
        values: { name: { value: `Record ${i}` } },
      }));

      mockSearchObject.mockResolvedValue(mockRecords);

      // Act
      const result = await openaiTools.search('test', {
        limit: 50,
        types: ['people'],
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data!.length).toBeLessThanOrEqual(50);
      expect(result.metrics!.searchTime).toBeLessThan(5000); // Should complete quickly
    });
  });

  describe('Configuration Integration', () => {
    it('should apply custom configuration correctly', async () => {
      // Arrange
      const customTools = new OpenAITools({
        baseUrl: 'https://custom.attio.com',
        defaultSearchOptions: {
          limit: 5,
          types: ['people'],
          minRelevance: 0.8,
        },
      });

      const mockRecords = [
        { id: 'person-1', values: { name: { value: 'John Doe' } } },
      ];

      mockSearchObject.mockResolvedValue(mockRecords);

      // Act
      const result = await customTools.search('test');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data![0].url).toContain('https://custom.attio.com');
      
      // Should only search people (as per custom config)
      expect(mockSearchObject).toHaveBeenCalledTimes(1);
    });

    it('should provide health check functionality', async () => {
      // Arrange
      const mockRecords = [{ id: 'test', values: { name: { value: 'Test' } } }];
      mockSearchObject.mockResolvedValue(mockRecords);

      // Act
      const health = await openaiTools.healthCheck();

      // Assert
      expect(health.status).toBe('healthy');
      expect(health.details).toMatchObject({
        cache: expect.any(Object),
        config: expect.any(Object),
        searchTest: {
          success: true,
          time: expect.any(Number),
        },
      });
    });

    it('should report degraded health on search failures', async () => {
      // Arrange
      mockSearchObject.mockRejectedValue(new Error('Search failed'));

      // Act
      const health = await openaiTools.healthCheck();

      // Assert
      expect(health.status).toBe('degraded');
      expect(health.details.searchTest.success).toBe(false);
      expect(health.details.searchTest.error).toBeDefined();
    });
  });
});