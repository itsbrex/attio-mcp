/**
 * Unit tests for OpenAI Fetch Tool
 */

import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { OpenAIFetchTool } from '../../src/openai/fetch-tool.js';
import { OpenAIDataTransformer } from '../../src/openai/data-transformer.js';
import { getAttioClient } from '../../src/api/attio-client.js';
import { callWithRetry } from '../../src/api/operations/retry.js';

// Mock dependencies
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

const mockGetAttioClient = getAttioClient as MockedFunction<typeof getAttioClient>;
const mockCallWithRetry = callWithRetry as MockedFunction<typeof callWithRetry>;

describe('OpenAIFetchTool', () => {
  let fetchTool: OpenAIFetchTool;
  let mockTransformer: OpenAIDataTransformer;
  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API client
    mockApi = {
      get: vi.fn(),
    };
    mockGetAttioClient.mockReturnValue(mockApi);

    // Mock callWithRetry to just execute the function
    mockCallWithRetry.mockImplementation(async (fn) => await fn());

    mockTransformer = new OpenAIDataTransformer();
    
    // Mock transformer methods
    vi.spyOn(mockTransformer, 'transformToFetchResult').mockImplementation((record, objectType) => ({
      id: record.id || 'test-id',
      title: record.values?.name?.value || 'Test Title',
      text: `Detailed content for ${objectType}`,
      url: `https://app.attio.com/${objectType}/test-id`,
      metadata: {
        objectType,
        recordId: record.id,
      },
    }));

    fetchTool = new OpenAIFetchTool(mockTransformer);
  });

  describe('fetch', () => {
    it('should successfully fetch a record', async () => {
      // Arrange
      const mockRecord = {
        id: 'person-123',
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: ['john@example.com'] },
        },
      };

      mockApi.get.mockResolvedValue({
        data: { data: mockRecord },
      });

      // Act
      const result = await fetchTool.fetch('person-123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        id: 'person-123',
        title: 'John Doe',
        url: expect.stringContaining('person-123'),
      });
      expect(result.metrics).toBeDefined();
      expect(result.metrics!.searchTime).toBeGreaterThan(0);
      expect(result.context.id).toBe('person-123');
    });

    it('should handle empty ID', async () => {
      // Act
      const result = await fetchTool.fetch('');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FETCH_ERROR');
      expect(result.error?.message).toContain('empty');
    });

    it('should handle record not found', async () => {
      // Arrange
      mockApi.get.mockResolvedValue({ data: null });

      // Act
      const result = await fetchTool.fetch('nonexistent-id');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FETCH_ERROR');
      expect(result.error?.message).toContain('not found');
    });

    it('should try multiple object types', async () => {
      // Arrange
      const mockRecord = {
        id: 'test-123',
        values: { name: { value: 'Test Record' } },
      };

      // First call returns 404, second succeeds
      mockApi.get
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: { data: mockRecord } });

      // Act
      const result = await fetchTool.fetch('test-123');

      // Assert
      expect(result.success).toBe(true);
      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(result.data!.id).toBe('test-123');
    });

    it('should handle API errors', async () => {
      // Arrange
      mockApi.get.mockRejectedValue(new Error('API Error'));

      // Act
      const result = await fetchTool.fetch('test-id');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FETCH_ERROR');
      expect(result.error?.message).toContain('not found in any object type');
    });

    it('should include related data when requested', async () => {
      // Arrange
      const mockRecord = {
        id: 'person-123',
        values: {
          name: { value: 'John Doe' },
          company: { value: { id: 'company-456', name: 'Acme Corp' } },
        },
      };

      mockApi.get.mockResolvedValue({
        data: { data: mockRecord },
      });

      // Act
      const result = await fetchTool.fetch('person-123', { includeRelated: true });

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransformer.transformToFetchResult).toHaveBeenCalledWith(
        mockRecord,
        expect.any(String),
        true
      );
    });

    it('should determine object type from ID pattern', async () => {
      const testCases = [
        { id: 'person-123', expectedFirstType: 'people' },
        { id: 'company-456', expectedFirstType: 'companies' },
        { id: 'list-789', expectedFirstType: 'lists' },
        { id: 'task-999', expectedFirstType: 'tasks' },
        { id: 'generic-123', expectedFirstType: 'people' }, // Default order
      ];

      for (const testCase of testCases) {
        mockApi.get.mockResolvedValueOnce({
          data: { data: { id: testCase.id, values: { name: { value: 'Test' } } } },
        });

        const result = await fetchTool.fetch(testCase.id);

        expect(result.success).toBe(true);
        expect(mockApi.get).toHaveBeenCalledWith(
          expect.stringContaining(`/${testCase.expectedFirstType}/`)
        );

        mockApi.get.mockClear();
      }
    });
  });

  describe('batchFetch', () => {
    it('should fetch multiple records successfully', async () => {
      // Arrange
      const ids = ['person-1', 'person-2', 'person-3'];
      const mockRecords = ids.map(id => ({
        id,
        values: { name: { value: `Person ${id}` } },
      }));

      mockApi.get
        .mockResolvedValueOnce({ data: { data: mockRecords[0] } })
        .mockResolvedValueOnce({ data: { data: mockRecords[1] } })
        .mockResolvedValueOnce({ data: { data: mockRecords[2] } });

      // Act
      const result = await fetchTool.batchFetch(ids);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.metrics!.resultCount).toBe(3);
      expect(result.metrics!.objectsSearched).toBe(3);
    });

    it('should handle empty ID list', async () => {
      // Act
      const result = await fetchTool.batchFetch([]);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('BATCH_FETCH_ERROR');
      expect(result.error?.message).toContain('No IDs provided');
    });

    it('should handle batch size limit', async () => {
      // Arrange
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);

      // Act
      const result = await fetchTool.batchFetch(ids);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('BATCH_FETCH_ERROR');
      expect(result.error?.message).toContain('limited to 100');
    });

    it('should handle partial failures gracefully', async () => {
      // Arrange
      const ids = ['success-1', 'fail-2', 'success-3'];

      mockApi.get
        .mockResolvedValueOnce({ data: { data: { id: 'success-1', values: { name: { value: 'Success 1' } } } } })
        .mockRejectedValueOnce(new Error('Fetch failed'))
        .mockResolvedValueOnce({ data: { data: { id: 'success-3', values: { name: { value: 'Success 3' } } } } });

      // Act
      const result = await fetchTool.batchFetch(ids);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2); // Only successful fetches
      expect(result.metrics!.resultCount).toBe(2);
      expect(result.metrics!.objectsSearched).toBe(3); // All attempts counted
    });

    it('should include related data in batch fetch', async () => {
      // Arrange
      const ids = ['person-1'];
      const mockRecord = {
        id: 'person-1',
        values: { name: { value: 'John Doe' } },
      };

      mockApi.get.mockResolvedValue({ data: { data: mockRecord } });

      // Act
      const result = await fetchTool.batchFetch(ids, { includeRelated: true });

      // Assert
      expect(result.success).toBe(true);
      expect(mockTransformer.transformToFetchResult).toHaveBeenCalledWith(
        mockRecord,
        expect.any(String),
        true
      );
    });
  });

  describe('mapToResourceType', () => {
    it('should map object types correctly', async () => {
      const mockRecord = { id: 'test', values: { name: { value: 'Test' } } };
      
      const testCases = [
        { input: 'people', expected: '/objects/people/' },
        { input: 'companies', expected: '/objects/companies/' },
        { input: 'lists', expected: '/objects/lists/' },
        { input: 'tasks', expected: '/objects/tasks/' },
      ];

      for (const testCase of testCases) {
        mockApi.get.mockResolvedValueOnce({ data: { data: mockRecord } });
        
        // Modify the fetch tool to only try one type for this test
        const result = await fetchTool.fetch('test-id');
        
        // The first call should be to the expected endpoint
        const firstCall = mockApi.get.mock.calls[0];
        expect(firstCall[0]).toContain(testCase.expected);
        
        mockApi.get.mockClear();
      }
    });
  });
});