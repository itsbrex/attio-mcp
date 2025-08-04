/**
 * OpenAI-compliant Fetch Tool Implementation
 * Provides ChatGPT-compatible fetch functionality for detailed record retrieval
 */

import {
  OpenAIFetchResult,
  OpenAIToolResponse,
  OpenAIFetchContext,
  SearchMetrics,
  OpenAIToolError,
} from '../types/openai-types.js';
import { IOpenAIFetchTool, IOpenAIDataTransformer } from './interfaces.js';
import { getAttioClient } from '../api/attio-client.js';
import { ResourceType, AttioRecord } from '../types/attio.js';
import { OpenAIDataTransformer } from './data-transformer.js';
import { callWithRetry } from '../api/operations/retry.js';

/**
 * OpenAI-compliant fetch tool implementation
 */
export class OpenAIFetchTool implements IOpenAIFetchTool {
  private transformer: IOpenAIDataTransformer;
  private api = getAttioClient();

  constructor(transformer?: IOpenAIDataTransformer) {
    this.transformer = transformer || new OpenAIDataTransformer();
  }

  /**
   * Fetch detailed information about a specific record
   */
  async fetch(
    id: string,
    options?: { includeRelated?: boolean }
  ): Promise<OpenAIToolResponse<OpenAIFetchResult>> {
    const startTime = Date.now();
    const context: OpenAIFetchContext = {
      id,
      includeRelated: options?.includeRelated || false,
      timestamp: new Date().toISOString(),
    };

    try {
      console.log(`[OpenAI Fetch] Starting fetch for ID: "${id}"`);

      // Validate input
      if (!id || id.trim().length === 0) {
        throw new Error('Record ID cannot be empty');
      }

      // Determine object type and fetch the record
      const { record, objectType } = await this.fetchRecord(id);

      if (!record) {
        throw new Error(`Record with ID "${id}" not found`);
      }

      console.log(`[OpenAI Fetch] Found ${objectType} record: ${record.id}`);

      // Transform to OpenAI format
      const result = this.transformer.transformToFetchResult(
        record,
        objectType,
        options?.includeRelated
      );

      const endTime = Date.now();
      const metrics: SearchMetrics = {
        searchTime: endTime - startTime,
        resultCount: 1,
        objectsSearched: 1,
        wasCached: false, // TODO: Implement caching
      };

      console.log(`[OpenAI Fetch] Completed in ${metrics.searchTime}ms`);

      return {
        success: true,
        data: result,
        metrics,
        context,
      };

    } catch (error) {
      const endTime = Date.now();
      const toolError: OpenAIToolError = {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown fetch error',
        details: error,
        timestamp: new Date().toISOString(),
      };

      console.error('[OpenAI Fetch] Fetch failed:', toolError);

      return {
        success: false,
        error: toolError,
        metrics: {
          searchTime: endTime - startTime,
          resultCount: 0,
          objectsSearched: 0,
          wasCached: false,
        },
        context,
      };
    }
  }

  /**
   * Fetch a record by trying different object types
   */
  private async fetchRecord(id: string): Promise<{ record: AttioRecord; objectType: string }> {
    // Try to determine object type from ID format or try multiple types
    const objectTypes = this.getObjectTypesToTry(id);

    for (const objectType of objectTypes) {
      try {
        console.log(`[OpenAI Fetch] Trying to fetch as ${objectType}`);
        const record = await this.fetchFromObjectType(id, objectType);
        
        if (record) {
          return { record, objectType };
        }
      } catch (error) {
        console.warn(`[OpenAI Fetch] Failed to fetch from ${objectType}:`, error);
        // Continue trying other object types
      }
    }

    throw new Error(`Record with ID "${id}" not found in any object type`);
  }

  /**
   * Determine which object types to try based on ID format
   */
  private getObjectTypesToTry(id: string): string[] {
    // Analyze ID to make educated guesses about object type
    const lowerId = id.toLowerCase();

    // Check for common patterns in Attio IDs
    if (lowerId.includes('person') || lowerId.includes('people')) {
      return ['people', 'companies', 'lists', 'tasks'];
    }

    if (lowerId.includes('company') || lowerId.includes('companies')) {
      return ['companies', 'people', 'lists', 'tasks'];
    }

    if (lowerId.includes('list')) {
      return ['lists', 'people', 'companies', 'tasks'];
    }

    if (lowerId.includes('task')) {
      return ['tasks', 'people', 'companies', 'lists'];
    }

    // Default order: most commonly fetched types first
    return ['people', 'companies', 'lists', 'tasks'];
  }

  /**
   * Fetch record from a specific object type
   */
  private async fetchFromObjectType(id: string, objectType: string): Promise<AttioRecord | null> {
    const resourceType = this.mapToResourceType(objectType);
    const path = `/objects/${resourceType}/records/${encodeURIComponent(id)}`;

    return callWithRetry(async () => {
      try {
        const response = await this.api.get(path);
        
        if (response.data && response.data.data) {
          return response.data.data;
        }
        
        return response.data;
      } catch (error: any) {
        // 404 means not found in this object type, which is expected
        if (error.response && error.response.status === 404) {
          return null;
        }
        
        // Other errors should be thrown
        throw error;
      }
    });
  }

  /**
   * Map string type to ResourceType enum
   */
  private mapToResourceType(objectType: string): ResourceType {
    switch (objectType.toLowerCase()) {
      case 'people':
      case 'person':
        return ResourceType.PEOPLE;
      case 'companies':
      case 'company':
        return ResourceType.COMPANIES;
      case 'lists':
      case 'list':
        return ResourceType.LISTS;
      case 'tasks':
      case 'task':
        return ResourceType.TASKS;
      default:
        throw new Error(`Unsupported object type: ${objectType}`);
    }
  }

  /**
   * Fetch record with relationships (for includeRelated option)
   */
  private async fetchWithRelationships(id: string, objectType: string): Promise<AttioRecord> {
    // TODO: Implement relationship fetching
    // This would fetch the main record plus any related records
    
    const record = await this.fetchFromObjectType(id, objectType);
    if (!record) {
      throw new Error(`Record not found: ${id}`);
    }

    // For now, just return the main record
    // In a full implementation, this would also fetch:
    // - Related people/companies
    // - Notes attached to the record
    // - Tasks associated with the record
    // - List memberships
    // - Activity history

    return record;
  }

  /**
   * Batch fetch multiple records (utility method)
   */
  async batchFetch(
    ids: string[],
    options?: { includeRelated?: boolean }
  ): Promise<OpenAIToolResponse<OpenAIFetchResult[]>> {
    const startTime = Date.now();
    const context: OpenAIFetchContext = {
      id: `batch:${ids.length}`, 
      includeRelated: options?.includeRelated || false,
      timestamp: new Date().toISOString(),
    };

    try {
      console.log(`[OpenAI Fetch] Starting batch fetch for ${ids.length} IDs`);

      // Validate input
      if (!ids || ids.length === 0) {
        throw new Error('No IDs provided for batch fetch');
      }

      if (ids.length > 100) {
        throw new Error('Batch fetch limited to 100 records at a time');
      }

      // Fetch all records concurrently
      const fetchPromises = ids.map(async (id) => {
        try {
          const result = await this.fetch(id, options);
          return result.success ? result.data : null;
        } catch (error) {
          console.warn(`[OpenAI Fetch] Failed to fetch ${id}:`, error);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      const validResults = results.filter((result): result is OpenAIFetchResult => result !== null);

      const endTime = Date.now();
      const metrics: SearchMetrics = {
        searchTime: endTime - startTime,
        resultCount: validResults.length,
        objectsSearched: ids.length,
        wasCached: false,
      };

      console.log(`[OpenAI Fetch] Batch completed in ${metrics.searchTime}ms, ${validResults.length}/${ids.length} successful`);

      return {
        success: true,
        data: validResults,
        metrics,
        context,
      };

    } catch (error) {
      const endTime = Date.now();
      const toolError: OpenAIToolError = {
        code: 'BATCH_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown batch fetch error',
        details: error,
        timestamp: new Date().toISOString(),
      };

      console.error('[OpenAI Fetch] Batch fetch failed:', toolError);

      return {
        success: false,
        error: toolError,
        metrics: {
          searchTime: endTime - startTime,
          resultCount: 0,
          objectsSearched: ids.length,
          wasCached: false,
        },
        context,
      };
    }
  }
}