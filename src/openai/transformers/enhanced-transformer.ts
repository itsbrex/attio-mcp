/**
 * Enhanced Transformer with Advanced Features
 * Integrates advanced data transformation capabilities into existing transformers
 */

import { dataTransformer } from '../advanced/data-transformer.js';
import { features } from '../../config/features.js';
import { debug } from '../../utils/logger.js';
import type { OpenAISearchResult, OpenAIFetchResult } from '../types.js';

/**
 * Enhanced transformer wrapper that adds advanced features
 */
export class EnhancedTransformer {
  private baseTransformer: any;
  private resourceType: string;

  constructor(baseTransformer: any, resourceType: string) {
    this.baseTransformer = baseTransformer;
    this.resourceType = resourceType;
  }

  /**
   * Transform to search result with advanced features
   */
  public async toSearchResult(record: any): Promise<OpenAISearchResult | null> {
    try {
      // Get base transformation
      const baseResult = this.baseTransformer.toSearchResult(record);
      if (!baseResult) return null;

      // Apply advanced transformation if enabled
      if (features.isEnabled('enableDataTransformation')) {
        const pipelineName = `${this.resourceType}Transform`;

        try {
          const enhanced = await dataTransformer.transform(
            baseResult,
            'openaiSearch',
            {
              cache: features.isEnabled('enableCache'),
              validate: true,
              errorHandling: 'skip',
            }
          );

          // Apply resource-specific transformations
          const resourceEnhanced = await this.applyResourceSpecificTransform(
            enhanced,
            pipelineName
          );

          return resourceEnhanced as OpenAISearchResult;
        } catch (error) {
          debug(
            'EnhancedTransformer',
            `Advanced transformation failed, using base result`,
            { error, resourceType: this.resourceType },
            'toSearchResult'
          );
          return baseResult;
        }
      }

      return baseResult;
    } catch (error) {
      debug(
        'EnhancedTransformer',
        `Transformation failed for ${this.resourceType}`,
        { error },
        'toSearchResult'
      );
      return null;
    }
  }

  /**
   * Transform to fetch result with advanced features
   */
  public async toFetchResult(record: any): Promise<OpenAIFetchResult | null> {
    try {
      // Get base transformation
      const baseResult = this.baseTransformer.toFetchResult(record);
      if (!baseResult) return null;

      // Apply advanced transformation if enabled
      if (features.isEnabled('enableDataTransformation')) {
        const pipelineName = `${this.resourceType}Transform`;

        try {
          const enhanced = await dataTransformer.transform(
            baseResult,
            'openaiFetch',
            {
              cache: features.isEnabled('enableCache'),
              validate: false,
              errorHandling: 'default',
            }
          );

          // Apply resource-specific transformations
          const resourceEnhanced = await this.applyResourceSpecificTransform(
            enhanced,
            pipelineName
          );

          // Apply sensitive data masking if needed
          const masked = await this.applySensitiveDataMasking(resourceEnhanced);

          return masked as OpenAIFetchResult;
        } catch (error) {
          debug(
            'EnhancedTransformer',
            `Advanced transformation failed, using base result`,
            { error, resourceType: this.resourceType },
            'toFetchResult'
          );
          return baseResult;
        }
      }

      return baseResult;
    } catch (error) {
      debug(
        'EnhancedTransformer',
        `Transformation failed for ${this.resourceType}`,
        { error },
        'toFetchResult'
      );
      return null;
    }
  }

  /**
   * Apply resource-specific transformations
   */
  private async applyResourceSpecificTransform(
    data: any,
    pipelineName: string
  ): Promise<any> {
    try {
      // Try to apply resource-specific pipeline
      const result = await dataTransformer.transform(data, pipelineName, {
        cache: false,
        validate: false,
        errorHandling: 'skip',
      });
      return result;
    } catch (error) {
      // Pipeline might not exist, return original data
      return data;
    }
  }

  /**
   * Apply sensitive data masking
   */
  private async applySensitiveDataMasking(data: any): Promise<any> {
    if (!features.isEnabled('enableDataTransformation')) {
      return data;
    }

    try {
      return await dataTransformer.transform(data, 'sensitiveDataMask', {
        cache: false,
        validate: false,
        errorHandling: 'skip',
      });
    } catch (error) {
      // Masking pipeline might not exist, return original data
      return data;
    }
  }

  /**
   * Validate data against resource-specific rules
   */
  public async validate(
    data: any
  ): Promise<{ valid: boolean; errors: string[] }> {
    if (!features.isEnabled('enableDataTransformation')) {
      return { valid: true, errors: [] };
    }

    return dataTransformer.validate(data, this.resourceType);
  }

  /**
   * Create a batch transformer for multiple records
   */
  public createBatchTransformer() {
    const self = this;
    return {
      async toSearchResults(records: any[]): Promise<OpenAISearchResult[]> {
        const results: OpenAISearchResult[] = [];

        for (const record of records) {
          const result = await self.toSearchResult(record);
          if (result) {
            results.push(result);
          }
        }

        return results;
      },

      async toFetchResults(records: any[]): Promise<OpenAIFetchResult[]> {
        const results: OpenAIFetchResult[] = [];

        for (const record of records) {
          const result = await self.toFetchResult(record);
          if (result) {
            results.push(result);
          }
        }

        return results;
      },
    };
  }
}

/**
 * Factory function to create enhanced transformers
 */
export function createEnhancedTransformer(
  baseTransformer: any,
  resourceType: string
): EnhancedTransformer {
  return new EnhancedTransformer(baseTransformer, resourceType);
}

/**
 * Enhance all existing transformers
 */
export function enhanceAllTransformers(
  transformers: Record<string, any>
): Record<string, EnhancedTransformer> {
  const enhanced: Record<string, EnhancedTransformer> = {};

  for (const [key, transformer] of Object.entries(transformers)) {
    enhanced[key] = createEnhancedTransformer(transformer, key);
  }

  return enhanced;
}
