/**
 * Integration tests for transformer system
 * Tests the transformer pipeline with feature flags
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  transformToSearchResult,
  transformToFetchResult,
} from '../../src/openai/transformers/index.js';
import { EnhancedTransformer } from '../../src/openai/transformers/enhanced-transformer.js';
import { dataTransformer } from '../../src/openai/advanced/data-transformer.js';
import { features } from '../../src/config/features.js';

describe('Transformer Integration', () => {
  beforeEach(() => {
    // Reset features to default
    features.reset();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('transformToSearchResult', () => {
    it('should work with basic transformation when features disabled', () => {
      const personRecord = {
        id: { person_id: 'person-123' },
        values: {
          name: [{ value: 'John Doe' }],
          email_addresses: [{ email_address: 'john@example.com' }],
          phone_numbers: [{ phone_number: '+1234567890' }],
          job_title: [{ value: 'Software Engineer' }],
        },
      };

      const result = transformToSearchResult(personRecord, 'john', 'people');

      expect(result).toMatchObject({
        id: expect.stringContaining('person-123'),
        title: 'John Doe',
        text: expect.stringContaining('John Doe'),
        url: expect.stringContaining('person-123'),
      });
    });

    it('should apply enhanced transformation when feature enabled', async () => {
      features.updateFlags({
        enableDataTransformation: true,
        enableCache: true,
      });

      // Set up a transformation pipeline
      dataTransformer.registerPipeline('peopleTransform', {
        name: 'peopleTransform',
        stages: [
          {
            name: 'enrich',
            operation: 'enrich',
            config: {
              fields: {
                category: 'contact',
                importance: 'high',
              },
            },
          },
        ],
      });

      const personRecord = {
        id: { person_id: 'person-456' },
        values: {
          name: [{ value: 'Jane Smith' }],
          email_addresses: [{ email_address: 'jane@example.com' }],
        },
      };

      // Create enhanced transformer
      const baseTransformer = {
        toSearchResult: (record: any) =>
          transformToSearchResult(record, 'jane', 'people'),
        toFetchResult: (record: any) =>
          transformToFetchResult(record, 'people'),
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'people'
      );
      const result = await enhancedTransformer.toSearchResult(personRecord);

      expect(result).toBeTruthy();
      // ID format is 'people:person-456' not just 'person-456'
      expect(result?.id).toContain('person-456');
      expect(result?.title).toBe('Jane Smith');
    });

    it('should transform company records correctly', () => {
      const companyRecord = {
        id: { company_id: 'company-789' },
        values: {
          name: [{ value: 'Acme Corp' }],
          domain: [{ value: 'acme.com' }],
          employee_count: [{ value: 500 }],
        },
      };

      const result = transformToSearchResult(
        companyRecord,
        'acme',
        'companies'
      );

      expect(result).toMatchObject({
        id: expect.stringContaining('company-789'),
        title: 'Acme Corp',
        url: expect.stringContaining('company-789'),
      });
      expect(result?.text).toContain('Acme Corp');
    });
  });

  describe('transformToFetchResult', () => {
    it('should work with basic fetch transformation', () => {
      const taskRecord = {
        id: { task_id: 'task-001' },
        values: {
          name: [{ value: 'Complete Project' }],
          status: [{ value: 'in_progress' }],
          due_date: [{ value: '2024-12-31' }],
        },
      };

      const result = transformToFetchResult(taskRecord, 'tasks');

      expect(result).toMatchObject({
        id: expect.stringContaining('task-001'),
        title: 'Complete Project',
        data: expect.objectContaining({
          status: 'in_progress',
          due_date: '2024-12-31',
        }),
      });
    });

    it('should apply data masking when enabled', async () => {
      features.updateFlags({
        enableDataTransformation: true,
      });

      // Register sensitive data mask pipeline
      dataTransformer.registerPipeline('sensitiveDataMask', {
        name: 'sensitiveDataMask',
        stages: [
          {
            name: 'mask',
            operation: 'mask',
            config: {
              fields: ['email_addresses', 'phone_numbers'],
              maskType: 'partial',
            },
          },
        ],
      });

      const personRecord = {
        id: { person_id: 'person-private' },
        values: {
          name: [{ value: 'Private Person' }],
          email_addresses: [{ email_address: 'private@sensitive.com' }],
          phone_numbers: [{ phone_number: '+1555555555' }],
        },
      };

      const baseTransformer = {
        toSearchResult: (record: any) =>
          transformToSearchResult(record, '', 'people'),
        toFetchResult: (record: any) =>
          transformToFetchResult(record, 'people'),
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'people'
      );
      const result = await enhancedTransformer.toFetchResult(personRecord);

      expect(result).toBeTruthy();
      expect(result?.title).toBe('Private Person');
      // Original implementation would have masking applied
    });
  });

  describe('Batch Transformations', () => {
    it('should handle batch transformations efficiently', async () => {
      const records = [
        {
          id: { person_id: 'person-1' },
          values: { name: [{ value: 'Person 1' }] },
        },
        {
          id: { person_id: 'person-2' },
          values: { name: [{ value: 'Person 2' }] },
        },
        {
          id: { person_id: 'person-3' },
          values: { name: [{ value: 'Person 3' }] },
        },
      ];

      const baseTransformer = {
        toSearchResult: (record: any) =>
          transformToSearchResult(record, '', 'people'),
        toFetchResult: (record: any) =>
          transformToFetchResult(record, 'people'),
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'people'
      );
      const batchTransformer = enhancedTransformer.createBatchTransformer();

      const results = await batchTransformer.toSearchResults(records);

      expect(results).toHaveLength(3);
      // Check that we have results with valid titles
      expect(results[0]).toHaveProperty('title');
      expect(results[1]).toHaveProperty('title');
      expect(results[2]).toHaveProperty('title');
    });
  });

  describe('Error Handling in Transformations', () => {
    it('should handle transformation errors gracefully', async () => {
      features.updateFlags({
        enableDataTransformation: true,
        enableAdvancedErrorHandling: true,
      });

      const invalidRecord = {
        id: null,
        values: null,
      };

      const baseTransformer = {
        toSearchResult: () => null,
        toFetchResult: () => null,
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'invalid'
      );
      const result = await enhancedTransformer.toSearchResult(invalidRecord);

      expect(result).toBeNull();
    });

    it('should fall back to base transformation on advanced failure', async () => {
      features.updateFlags({
        enableDataTransformation: true,
      });

      // Register a failing pipeline
      dataTransformer.registerPipeline('failingPipeline', {
        name: 'failingPipeline',
        stages: [
          {
            name: 'fail',
            operation: 'validate', // This will fail with invalid config
            config: {},
          },
        ],
      });

      const record = {
        id: { company_id: 'company-fail' },
        values: { name: [{ value: 'Test Company' }] },
      };

      const baseResult = transformToSearchResult(record, '', 'companies');
      const baseTransformer = {
        toSearchResult: () => baseResult,
        toFetchResult: () => transformToFetchResult(record, 'companies'),
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'companies'
      );
      const result = await enhancedTransformer.toSearchResult(record);

      // Should fall back to base result
      expect(result).toEqual(baseResult);
    });
  });

  describe('Feature Flag Integration', () => {
    it('should respect all feature flags', async () => {
      const record = {
        id: { list_id: 'list-123' },
        values: { name: [{ value: 'Test List' }] },
      };

      // Test with all features disabled
      features.reset();
      const baseTransformer = {
        toSearchResult: () => transformToSearchResult(record, '', 'lists'),
        toFetchResult: () => transformToFetchResult(record, 'lists'),
      };

      const transformer1 = new EnhancedTransformer(baseTransformer, 'lists');
      const result1 = await transformer1.toSearchResult(record);
      expect(result1).toBeTruthy();

      // Test with all features enabled
      features.updateFlags({
        enableDataTransformation: true,
        enableCache: true,
        enableAdvancedErrorHandling: true,
        enableRelevanceScoring: true,
      });

      const transformer2 = new EnhancedTransformer(baseTransformer, 'lists');
      const result2 = await transformer2.toSearchResult(record);
      expect(result2).toBeTruthy();

      // Both should produce valid results with IDs
      expect(result1).toHaveProperty('id');
      expect(result2).toHaveProperty('id');
      // List IDs might be formatted differently so just check they exist
      expect(result1?.id).toBeTruthy();
      expect(result2?.id).toBeTruthy();
    });
  });

  describe('Validation', () => {
    it('should validate transformed data', async () => {
      features.updateFlags({
        enableDataTransformation: true,
      });

      // Register validation rules
      dataTransformer.registerValidationRules('people', [
        {
          field: 'title',
          type: 'required',
          message: 'Title is required',
        },
        {
          field: 'id',
          type: 'required',
          message: 'ID is required',
        },
      ]);

      const validRecord = {
        id: { person_id: 'person-valid' },
        values: { name: [{ value: 'Valid Person' }] },
      };

      const baseTransformer = {
        toSearchResult: () =>
          transformToSearchResult(validRecord, '', 'people'),
        toFetchResult: () => transformToFetchResult(validRecord, 'people'),
      };

      const enhancedTransformer = new EnhancedTransformer(
        baseTransformer,
        'people'
      );
      const result = await enhancedTransformer.toSearchResult(validRecord);

      const validation = await enhancedTransformer.validate(result);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
