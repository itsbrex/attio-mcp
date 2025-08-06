/**
 * Tests for advanced data transformation system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AdvancedDataTransformer,
  dataTransformer,
  TransformationPipeline,
  ValidationRule,
} from '../../src/openai/advanced/data-transformer.js';
import {
  pipelineManager,
  PipelineWorkflow,
} from '../../src/openai/advanced/transformation-pipeline.js';
import { features } from '../../src/config/features.js';
import { transformationConfig } from '../../src/config/transformation-config.js';

describe('Advanced Data Transformation', () => {
  beforeEach(() => {
    // Enable features for testing
    features.updateFlags({
      enableDataTransformation: true,
      enableCache: true,
      enableEnhancedLogging: false,
    });

    // Clear any existing state
    dataTransformer.clearCache();
    pipelineManager.clearWorkflows();
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Basic Transformations', () => {
    it('should rename fields', async () => {
      const pipeline: TransformationPipeline = {
        name: 'renameTest',
        rules: [
          { field: 'oldName', type: 'rename', config: { newName: 'newName' } },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { oldName: 'value', other: 'data' };
      const result = await dataTransformer.transform(input, 'renameTest');

      expect(result).toEqual({ newName: 'value', other: 'data' });
    });

    it('should format fields', async () => {
      const pipeline: TransformationPipeline = {
        name: 'formatTest',
        rules: [
          { field: 'name', type: 'format', config: { format: 'uppercase' } },
          { field: 'email', type: 'format', config: { format: 'lowercase' } },
          { field: 'title', type: 'format', config: { format: 'capitalize' } },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = {
        name: 'john doe',
        email: 'JOHN@EXAMPLE.COM',
        title: 'software engineer',
      };
      const result = await dataTransformer.transform(input, 'formatTest');

      expect(result.name).toBe('JOHN DOE');
      expect(result.email).toBe('john@example.com');
      expect(result.title).toBe('Software engineer');
    });

    it('should convert field types', async () => {
      const pipeline: TransformationPipeline = {
        name: 'convertTest',
        rules: [
          { field: 'age', type: 'convert', config: { targetType: 'number' } },
          {
            field: 'active',
            type: 'convert',
            config: { targetType: 'boolean' },
          },
          { field: 'tags', type: 'convert', config: { targetType: 'array' } },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = {
        age: '25',
        active: 'true',
        tags: 'tag1',
      };
      const result = await dataTransformer.transform(input, 'convertTest');

      expect(result.age).toBe(25);
      expect(typeof result.age).toBe('number');
      expect(result.active).toBe(true);
      expect(typeof result.active).toBe('boolean');
      expect(result.tags).toEqual(['tag1']);
      expect(Array.isArray(result.tags)).toBe(true);
    });
  });

  describe('Field Validation', () => {
    it('should validate required fields', async () => {
      const rules: ValidationRule[] = [
        { field: 'name', required: true, type: 'string' },
        { field: 'email', required: true, type: 'email' },
      ];

      dataTransformer.registerValidationRules('testValidation', rules);

      const invalidData = { email: 'test@example.com' };
      const validation = dataTransformer.validate(
        invalidData,
        'testValidation'
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Field 'name' is required");
    });

    it('should validate field types', async () => {
      const rules: ValidationRule[] = [
        { field: 'age', type: 'number', min: 0, max: 120 },
        { field: 'email', type: 'email' },
        { field: 'website', type: 'url' },
      ];

      dataTransformer.registerValidationRules('typeValidation', rules);

      const invalidData = {
        age: 150,
        email: 'not-an-email',
        website: 'not-a-url',
      };
      const validation = dataTransformer.validate(
        invalidData,
        'typeValidation'
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should validate enum values', async () => {
      const rules: ValidationRule[] = [
        { field: 'status', enum: ['pending', 'active', 'completed'] },
        { field: 'priority', enum: ['low', 'medium', 'high'] },
      ];

      dataTransformer.registerValidationRules('enumValidation', rules);

      const invalidData = {
        status: 'invalid',
        priority: 'urgent',
      };
      const validation = dataTransformer.validate(
        invalidData,
        'enumValidation'
      );

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBe(2);
    });

    it('should validate with custom validators', async () => {
      const rules: ValidationRule[] = [
        {
          field: 'password',
          custom: (value: any) => value && value.length >= 8,
        },
      ];

      dataTransformer.registerValidationRules('customValidation', rules);

      const invalidData = { password: 'short' };
      const validation = dataTransformer.validate(
        invalidData,
        'customValidation'
      );

      expect(validation.valid).toBe(false);
    });
  });

  describe('Data Sanitization', () => {
    it('should remove HTML tags', async () => {
      const pipeline: TransformationPipeline = {
        name: 'sanitizeTest',
        rules: [
          {
            field: 'description',
            type: 'sanitize',
            config: { removeHtml: true },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = {
        description: '<p>Hello <strong>world</strong></p>',
      };
      const result = await dataTransformer.transform(input, 'sanitizeTest');

      expect(result.description).toBe('Hello world');
    });

    it('should remove special characters', async () => {
      const pipeline: TransformationPipeline = {
        name: 'sanitizeSpecial',
        rules: [
          {
            field: 'text',
            type: 'sanitize',
            config: { removeSpecialChars: true },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = {
        text: 'Hello@#$%World!',
      };
      const result = await dataTransformer.transform(input, 'sanitizeSpecial');

      expect(result.text).toBe('HelloWorld');
    });

    it('should escape SQL injection characters', async () => {
      const pipeline: TransformationPipeline = {
        name: 'sanitizeSql',
        rules: [
          {
            field: 'query',
            type: 'sanitize',
            config: { escapeSql: true },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = {
        query: "'; DROP TABLE users; --",
      };
      const result = await dataTransformer.transform(input, 'sanitizeSql');

      expect(result.query).toContain("\\'");
      expect(result.query).toContain('\\;');
    });
  });

  describe('Data Masking', () => {
    it('should mask email addresses', async () => {
      const pipeline: TransformationPipeline = {
        name: 'maskEmail',
        rules: [
          {
            field: 'email',
            type: 'mask',
            config: { type: 'email' },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { email: 'johndoe@example.com' };
      const result = await dataTransformer.transform(input, 'maskEmail');

      expect(result.email).toMatch(/^jo\*+@example\.com$/);
    });

    it('should mask phone numbers', async () => {
      const pipeline: TransformationPipeline = {
        name: 'maskPhone',
        rules: [
          {
            field: 'phone',
            type: 'mask',
            config: { type: 'phone' },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { phone: '1234567890' };
      const result = await dataTransformer.transform(input, 'maskPhone');

      expect(result.phone).toMatch(/\*+7890$/);
    });

    it('should mask with custom patterns', async () => {
      const pipeline: TransformationPipeline = {
        name: 'maskCustom',
        rules: [
          {
            field: 'apiKey',
            type: 'mask',
            config: {
              maskChar: 'X',
              showFirst: 4,
              showLast: 4,
            },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { apiKey: 'abcd1234efgh5678' };
      const result = await dataTransformer.transform(input, 'maskCustom');

      expect(result.apiKey).toBe('abcdXXXXXXXX5678');
    });
  });

  describe('Field Enrichment', () => {
    it('should add metadata to fields', async () => {
      const pipeline: TransformationPipeline = {
        name: 'enrichTest',
        rules: [
          {
            field: 'value',
            type: 'enrich',
            config: {
              addMetadata: true,
              source: 'test',
              metadata: { version: '1.0' },
            },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { value: 'original' };
      const result = await dataTransformer.transform(input, 'enrichTest');

      expect(result.value).toHaveProperty('value', 'original');
      expect(result.value).toHaveProperty('source', 'test');
      expect(result.value).toHaveProperty('version', '1.0');
      expect(result.value).toHaveProperty('timestamp');
    });

    it('should enrich with lookup values', async () => {
      const pipeline: TransformationPipeline = {
        name: 'lookupTest',
        rules: [
          {
            field: 'countryCode',
            type: 'enrich',
            config: {
              lookup: {
                US: 'United States',
                UK: 'United Kingdom',
                CA: 'Canada',
              },
            },
          },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { countryCode: 'US' };
      const result = await dataTransformer.transform(input, 'lookupTest');

      expect(result.countryCode).toBe('United States');
    });
  });

  describe('Pipeline Workflows', () => {
    it('should execute multi-stage workflow', async () => {
      const workflow: PipelineWorkflow = {
        name: 'testWorkflow',
        stages: [
          {
            name: 'format',
            pipeline: {
              name: 'formatStage',
              rules: [
                {
                  field: 'name',
                  type: 'format',
                  config: { format: 'uppercase' },
                },
              ],
              errorHandling: 'skip',
            },
          },
          {
            name: 'validate',
            pipeline: {
              name: 'validateStage',
              rules: [
                { field: 'name', type: 'validate', config: { required: true } },
              ],
              errorHandling: 'throw',
            },
          },
        ],
        errorStrategy: 'fail-fast',
      };

      pipelineManager.registerWorkflow(workflow);

      const input = { name: 'john' };
      const result = await pipelineManager.executeWorkflow(
        input,
        'testWorkflow'
      );

      expect(result.name).toBe('JOHN');
    });

    it('should handle conditional stages', async () => {
      const workflow: PipelineWorkflow = {
        name: 'conditionalWorkflow',
        stages: [
          {
            name: 'maskSensitive',
            pipeline: {
              name: 'maskStage',
              rules: [{ field: 'ssn', type: 'mask', config: { type: 'ssn' } }],
              errorHandling: 'skip',
            },
            condition: (data: any) => data.hasSensitiveData === true,
          },
        ],
        errorStrategy: 'continue',
      };

      pipelineManager.registerWorkflow(workflow);

      const input1 = { ssn: '123456789', hasSensitiveData: true };
      const result1 = await pipelineManager.executeWorkflow(
        input1,
        'conditionalWorkflow'
      );
      expect(result1.ssn).toContain('*');

      const input2 = { ssn: '123456789', hasSensitiveData: false };
      const result2 = await pipelineManager.executeWorkflow(
        input2,
        'conditionalWorkflow'
      );
      expect(result2.ssn).toBe('123456789');
    });

    it('should handle workflow errors based on strategy', async () => {
      const workflow: PipelineWorkflow = {
        name: 'errorWorkflow',
        stages: [
          {
            name: 'willFail',
            pipeline: {
              name: 'failStage',
              rules: [
                {
                  field: 'invalid',
                  type: 'convert',
                  config: { targetType: 'number' },
                },
              ],
              errorHandling: 'throw',
            },
            required: false,
          },
        ],
        errorStrategy: 'continue',
      };

      pipelineManager.registerWorkflow(workflow);

      const input = { invalid: 'not-a-number' };
      const result = await pipelineManager.executeWorkflow(
        input,
        'errorWorkflow'
      );

      // Should return input unchanged when error strategy is 'continue'
      expect(result).toEqual(input);
    });
  });

  describe('Caching', () => {
    it('should cache transformation results', async () => {
      const pipeline: TransformationPipeline = {
        name: 'cacheTest',
        rules: [
          { field: 'value', type: 'format', config: { format: 'uppercase' } },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { value: 'test' };

      // First transform
      const result1 = await dataTransformer.transform(input, 'cacheTest', {
        cache: true,
      });
      expect(result1.value).toBe('TEST');

      // Second transform (should use cache)
      const spy = vi.spyOn(dataTransformer as any, 'applyRule');
      const result2 = await dataTransformer.transform(input, 'cacheTest', {
        cache: true,
      });

      expect(result2).toEqual(result1);
      expect(spy).not.toHaveBeenCalled();

      spy.mockRestore();
    });

    it('should provide cache statistics', () => {
      const stats = dataTransformer.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.maxSize).toBe('number');
    });
  });

  describe('Backward Compatibility', () => {
    it('should return data unchanged when feature is disabled', async () => {
      features.updateFlags({ enableDataTransformation: false });

      const pipeline: TransformationPipeline = {
        name: 'disabledTest',
        rules: [
          { field: 'value', type: 'format', config: { format: 'uppercase' } },
        ],
        errorHandling: 'throw',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { value: 'test' };
      const result = await dataTransformer.transform(input, 'disabledTest');

      expect(result).toEqual(input);
    });

    it('should handle missing pipelines gracefully', async () => {
      const input = { value: 'test' };

      await expect(
        dataTransformer.transform(input, 'nonexistent')
      ).rejects.toThrow("Pipeline 'nonexistent' not found");
    });

    it('should skip failed transformations with skip error handling', async () => {
      const pipeline: TransformationPipeline = {
        name: 'skipErrorTest',
        rules: [
          {
            field: 'invalid',
            type: 'convert',
            config: { targetType: 'number' },
          },
          { field: 'valid', type: 'format', config: { format: 'uppercase' } },
        ],
        errorHandling: 'skip',
      };

      dataTransformer.registerPipeline(pipeline);

      const input = { invalid: 'not-a-number', valid: 'test' };
      const result = await dataTransformer.transform(input, 'skipErrorTest');

      expect(result.invalid).toBe('not-a-number'); // Unchanged
      expect(result.valid).toBe('TEST'); // Transformed
    });
  });
});
