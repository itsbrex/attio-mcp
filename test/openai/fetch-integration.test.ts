/**
 * Integration tests for OpenAI fetch functionality
 * Tests the fetch tool with advanced features and backward compatibility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetch } from '../../src/openai/fetch.js';
import { features } from '../../src/config/features.js';
import { recordCache } from '../../src/openai/advanced/cache.js';
import { advancedErrorHandler } from '../../src/openai/advanced/error-handler.js';
import crypto from 'crypto';

// Mock the API client
vi.mock('../../src/api/attio-client.js', () => ({
  getAttioClient: vi.fn(() => ({
    request: vi.fn(),
  })),
}));

// Mock the tool dispatcher
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

describe('OpenAI Fetch Integration', () => {
  beforeEach(() => {
    features.reset();
    recordCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Basic Fetch Operations', () => {
    it('should fetch a person record by ID', async () => {
      const mockPerson = {
        data: {
          id: { person_id: 'person-123' },
          values: {
            name: [{ value: 'John Doe' }],
            email_addresses: [{ email_address: 'john@example.com' }],
            phone_numbers: [{ phone_number: '+1234567890' }],
            job_title: [{ value: 'Software Engineer' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockPerson);

      const result = await fetch('people:person-123');

      expect(result).toMatchObject({
        id: expect.stringContaining('person-123'),
        title: 'John Doe',
        data: expect.objectContaining({
          email_addresses: ['john@example.com'],
          phone_numbers: ['+1234567890'],
          job_title: 'Software Engineer',
        }),
      });
    });

    it('should fetch a company record by ID', async () => {
      const mockCompany = {
        data: {
          id: { company_id: 'company-456' },
          values: {
            name: [{ value: 'Acme Corp' }],
            domain: [{ value: 'acme.com' }],
            employee_count: [{ value: 500 }],
            industry: [{ value: 'Technology' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockCompany);

      const result = await fetch('companies:company-456');

      expect(result).toMatchObject({
        id: expect.stringContaining('company-456'),
        title: 'Acme Corp',
        data: expect.objectContaining({
          domain: 'acme.com',
          employee_count: 500,
          industry: 'Technology',
        }),
      });
    });

    it('should handle ID without type prefix', async () => {
      const mockRecord = {
        data: {
          id: { record_id: 'rec-789' },
          values: {
            name: [{ value: 'Generic Record' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockRecord);

      const result = await fetch('rec-789');

      expect(result).toBeTruthy();
      expect(executeToolRequest).toHaveBeenCalled();
    });

    it('should throw error for invalid ID', async () => {
      await expect(fetch('')).rejects.toThrow('ID parameter is required');
      await expect(fetch(null as any)).rejects.toThrow(
        'ID parameter is required'
      );
      await expect(fetch(123 as any)).rejects.toThrow('must be a string');
    });
  });

  describe('Cache Integration', () => {
    it('should use cache when enabled', async () => {
      features.updateFlags({ enableCache: true });

      const mockData = {
        data: {
          id: { person_id: 'person-cache' },
          values: {
            name: [{ value: 'Cached Person' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      // First call - should hit API
      const result1 = await fetch('people:person-cache');
      expect(executeToolRequest).toHaveBeenCalledTimes(1);

      // Second call - should hit cache
      const result2 = await fetch('people:person-cache');
      expect(executeToolRequest).toHaveBeenCalledTimes(1); // Still 1

      expect(result1).toEqual(result2);
    });

    it('should bypass cache when disabled', async () => {
      features.updateFlags({ enableCache: false });

      const mockData = {
        data: {
          id: { person_id: 'person-nocache' },
          values: {
            name: [{ value: 'No Cache Person' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      // Both calls should hit API
      await fetch('people:person-nocache');
      await fetch('people:person-nocache');

      expect(executeToolRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle cache expiration', async () => {
      features.updateFlags({ enableCache: true });

      const mockData = {
        data: {
          id: { person_id: 'person-expire' },
          values: {
            name: [{ value: 'Expiring Person' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      // Set cache with short TTL
      const cacheKey = 'test-expire';
      recordCache.set(cacheKey, mockData, 100); // 100ms TTL

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be expired
      const cached = recordCache.get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors with retry', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: true });

      const networkError = new Error('Network error');
      (networkError as any).code = 'ECONNREFUSED';

      vi.mocked(executeToolRequest)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: {
            id: { person_id: 'person-retry' },
            values: { name: [{ value: 'Retry Person' }] },
          },
        });

      const result = await fetch('people:person-retry');

      expect(result).toBeTruthy();
      expect(result.title).toBe('Retry Person');
      expect(executeToolRequest).toHaveBeenCalledTimes(3);
    });

    it('should handle API errors gracefully', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: true });

      const apiError = new Error('API Error');
      (apiError as any).response = { status: 404 };

      vi.mocked(executeToolRequest).mockRejectedValueOnce(apiError);

      await expect(fetch('people:not-found')).rejects.toThrow();
    });

    it('should fall back to cache on error when available', async () => {
      features.updateFlags({
        enableCache: true,
        enableAdvancedErrorHandling: true,
      });

      const cachedData = {
        id: 'people:person-fallback',
        title: 'Fallback Person',
        data: { name: 'Fallback Person' },
        url: 'https://app.attio.com/people/person-fallback',
      };

      // Pre-populate cache
      const cacheKey = `fetch:${crypto.createHash('md5').update('people:person-fallback').digest('hex')}`;
      recordCache.set(cacheKey, cachedData, 3600000);

      // Mock API failure
      vi.mocked(executeToolRequest).mockRejectedValueOnce(
        new Error('API Down')
      );

      const result = await fetch('people:person-fallback');

      expect(result).toEqual(cachedData);
      expect(executeToolRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data Transformation', () => {
    it('should transform list records correctly', async () => {
      const mockList = {
        data: {
          id: { list_id: 'list-123' },
          values: {
            name: [{ value: 'Customer List' }],
            entries: [{ value: 150 }],
            created_at: [{ value: '2024-01-01' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockList);

      const result = await fetch('lists:list-123');

      expect(result).toMatchObject({
        id: expect.stringContaining('list-123'),
        title: 'Customer List',
        data: expect.objectContaining({
          entries: 150,
          created_at: '2024-01-01',
        }),
      });
    });

    it('should transform task records correctly', async () => {
      const mockTask = {
        data: {
          id: { task_id: 'task-456' },
          values: {
            name: [{ value: 'Complete Project' }],
            status: [{ value: 'in_progress' }],
            due_date: [{ value: '2024-12-31' }],
            assignee: [
              { target_object: 'people', target_record_id: 'person-123' },
            ],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockTask);

      const result = await fetch('tasks:task-456');

      expect(result).toMatchObject({
        id: expect.stringContaining('task-456'),
        title: 'Complete Project',
        data: expect.objectContaining({
          status: 'in_progress',
          due_date: '2024-12-31',
        }),
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with all features disabled', async () => {
      // Ensure all features are disabled
      features.reset();

      const mockData = {
        data: {
          id: { person_id: 'person-compat' },
          values: {
            name: [{ value: 'Compatible Person' }],
            email_addresses: [{ email_address: 'compat@example.com' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('people:person-compat');

      expect(result).toMatchObject({
        id: expect.stringContaining('person-compat'),
        title: 'Compatible Person',
        data: expect.objectContaining({
          email_addresses: ['compat@example.com'],
        }),
      });
    });

    it('should maintain consistent output format', async () => {
      const mockData = {
        data: {
          id: { company_id: 'company-format' },
          values: {
            name: [{ value: 'Format Company' }],
            domain: [{ value: 'format.com' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValue(mockData);

      // Test with features disabled
      features.reset();
      const result1 = await fetch('companies:company-format');

      // Test with features enabled
      features.updateFlags({
        enableCache: true,
        enableDataTransformation: true,
        enableAdvancedErrorHandling: true,
      });
      const result2 = await fetch('companies:company-format');

      // Both should have same structure
      expect(result1).toHaveProperty('id');
      expect(result1).toHaveProperty('title');
      expect(result1).toHaveProperty('data');
      expect(result1).toHaveProperty('url');

      expect(result2).toHaveProperty('id');
      expect(result2).toHaveProperty('title');
      expect(result2).toHaveProperty('data');
      expect(result2).toHaveProperty('url');
    });
  });
});
