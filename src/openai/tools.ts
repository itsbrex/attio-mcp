/**
 * OpenAI Tools - Main Implementation
 * Combines search and fetch tools with caching and error handling
 */

import {
  OpenAISearchResult,
  OpenAIFetchResult,
  OpenAISearchOptions,
  OpenAIToolResponse,
  OpenAIToolsConfig,
  OpenAICacheConfig,
} from '../types/openai-types.js';
import {
  IOpenAITools,
  IOpenAIDataTransformer,
  IOpenAIRelevanceScorer,
  IOpenAICache,
} from './interfaces.js';
import { OpenAISearchTool } from './search-tool.js';
import { OpenAIFetchTool } from './fetch-tool.js';
import { OpenAIDataTransformer } from './data-transformer.js';
import { OpenAIRelevanceScorer } from './relevance-scorer.js';
import { OpenAICache } from './cache.js';

/**
 * Main OpenAI tools implementation
 * Provides the search and fetch functions that ChatGPT will use
 */
export class OpenAITools implements IOpenAITools {
  private searchTool: OpenAISearchTool;
  private fetchTool: OpenAIFetchTool;
  private cache: IOpenAICache;
  private config: OpenAIToolsConfig;

  constructor(
    config?: Partial<OpenAIToolsConfig>,
    dependencies?: {
      transformer?: IOpenAIDataTransformer;
      relevanceScorer?: IOpenAIRelevanceScorer;
      cache?: IOpenAICache;
    }
  ) {
    // Initialize configuration
    this.config = {
      baseUrl: 'https://app.attio.com',
      defaultSearchOptions: {
        limit: 20,
        types: ['people', 'companies', 'lists', 'tasks'],
        includeRelated: false,
        minRelevance: 0.1,
      },
      cache: {
        enabled: true,
        ttl: 5 * 60 * 1000, // 5 minutes
        maxSize: 1000,
        keyPrefix: 'openai:',
      },
      debug: process.env.NODE_ENV === 'development',
      maxConcurrency: 10,
      ...config,
    };

    // Initialize dependencies
    const transformer = dependencies?.transformer || new OpenAIDataTransformer(this.config.baseUrl);
    const relevanceScorer = dependencies?.relevanceScorer || new OpenAIRelevanceScorer();
    this.cache = dependencies?.cache || new OpenAICache(this.config.cache);

    // Initialize tools
    this.searchTool = new OpenAISearchTool(
      transformer,
      relevanceScorer,
      this.config.defaultSearchOptions
    );
    
    this.fetchTool = new OpenAIFetchTool(transformer);

    console.log('[OpenAI Tools] Initialized with config:', {
      cacheEnabled: this.config.cache.enabled,
      defaultLimit: this.config.defaultSearchOptions.limit,
      debug: this.config.debug,
    });
  }

  /**
   * Search across Attio CRM data
   * This is the main function that ChatGPT will call
   */
  async search(
    query: string,
    options?: OpenAISearchOptions
  ): Promise<OpenAIToolResponse<OpenAISearchResult[]>> {
    const startTime = Date.now();
    
    try {
      if (this.config.debug) {
        console.log(`[OpenAI Tools] Search request: "${query}"`, options);
      }

      // Check cache first
      if (this.config.cache.enabled) {
        const cachedResults = await this.cache.getSearchResults(query, options);
        if (cachedResults) {
          return {
            success: true,
            data: cachedResults,
            metrics: {
              searchTime: Date.now() - startTime,
              resultCount: cachedResults.length,
              objectsSearched: 0,
              wasCached: true,
              cacheInfo: {
                hit: true,
                key: `search:${query}`,
              },
            },
            context: {
              query,
              options,
              timestamp: new Date().toISOString(),
            },
          };
        }
      }

      // Execute search
      const result = await this.searchTool.search(query, options);

      // Cache successful results
      if (result.success && result.data && this.config.cache.enabled) {
        await this.cache.setSearchResults(query, result.data, options);
        
        if (result.metrics) {
          result.metrics.cacheInfo = {
            hit: false,
            key: `search:${query}`,
          };
        }
      }

      return result;

    } catch (error) {
      console.error('[OpenAI Tools] Search error:', error);
      
      return {
        success: false,
        error: {
          code: 'SEARCH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown search error',
          details: error,
          timestamp: new Date().toISOString(),
        },
        metrics: {
          searchTime: Date.now() - startTime,
          resultCount: 0,
          objectsSearched: 0,
          wasCached: false,
        },
        context: {
          query,
          options,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Fetch detailed information about a specific record
   * This is the main function that ChatGPT will call
   */
  async fetch(
    id: string,
    options?: { includeRelated?: boolean }
  ): Promise<OpenAIToolResponse<OpenAIFetchResult>> {
    const startTime = Date.now();
    
    try {
      if (this.config.debug) {
        console.log(`[OpenAI Tools] Fetch request: "${id}"`, options);
      }

      // Check cache first
      if (this.config.cache.enabled) {
        const cachedResult = await this.cache.getFetchResult(id);
        if (cachedResult) {
          return {
            success: true,
            data: cachedResult,
            metrics: {
              searchTime: Date.now() - startTime,
              resultCount: 1,
              objectsSearched: 0,
              wasCached: true,
              cacheInfo: {
                hit: true,
                key: `fetch:${id}`,
              },
            },
            context: {
              id,
              includeRelated: options?.includeRelated,
              timestamp: new Date().toISOString(),
            },
          };
        }
      }

      // Execute fetch
      const result = await this.fetchTool.fetch(id, options);

      // Cache successful results
      if (result.success && result.data && this.config.cache.enabled) {
        await this.cache.setFetchResult(id, result.data);
        
        if (result.metrics) {
          result.metrics.cacheInfo = {
            hit: false,
            key: `fetch:${id}`,
          };
        }
      }

      return result;

    } catch (error) {
      console.error('[OpenAI Tools] Fetch error:', error);
      
      return {
        success: false,
        error: {
          code: 'FETCH_ERROR',
          message: error instanceof Error ? error.message : 'Unknown fetch error',
          details: error,
          timestamp: new Date().toISOString(),
        },
        metrics: {
          searchTime: Date.now() - startTime,
          resultCount: 0,
          objectsSearched: 0,
          wasCached: false,
        },
        context: {
          id,
          includeRelated: options?.includeRelated,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OpenAIToolsConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OpenAIToolsConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update cache configuration if provided
    if (newConfig.cache) {
      if ('updateConfig' in this.cache) {
        (this.cache as OpenAICache).updateConfig(newConfig.cache);
      }
    }

    console.log('[OpenAI Tools] Configuration updated');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    console.log('[OpenAI Tools] Cache cleared');
  }

  /**
   * Warm up cache with common searches
   */
  async warmUpCache(commonQueries: string[]): Promise<void> {
    console.log(`[OpenAI Tools] Warming up cache with ${commonQueries.length} queries`);
    
    for (const query of commonQueries) {
      try {
        await this.search(query);
        console.log(`[OpenAI Tools] Warmed up cache for: "${query}"`);
      } catch (error) {
        console.warn(`[OpenAI Tools] Failed to warm up cache for: "${query}"`, error);
      }
    }
  }

  /**
   * Health check for the tools
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const health = {
      status: 'healthy' as const,
      details: {
        cache: this.getCacheStats(),
        config: {
          cacheEnabled: this.config.cache.enabled,
          defaultTypes: this.config.defaultSearchOptions.types,
          maxConcurrency: this.config.maxConcurrency,
        },
        timestamp: new Date().toISOString(),
      },
    };

    try {
      // Test a simple search to verify functionality
      const testResult = await this.search('test', { limit: 1 });
      health.details.searchTest = {
        success: testResult.success,
        time: testResult.metrics?.searchTime,
      };

      // If search failed, mark as degraded
      if (!testResult.success) {
        health.status = 'degraded';
        health.details.searchTest.error = testResult.error;
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.details.error = {
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
      };
    }

    return health;
  }

  /**
   * Get detailed statistics about tool usage
   */
  getStats() {
    return {
      cache: this.getCacheStats(),
      config: this.getConfig(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Create a default instance of OpenAI tools
 */
export function createOpenAITools(config?: Partial<OpenAIToolsConfig>): OpenAITools {
  return new OpenAITools(config);
}

/**
 * Export the main functions that ChatGPT will use
 */
const defaultTools = createOpenAITools();

export async function search(
  query: string,
  options?: OpenAISearchOptions
): Promise<Array<{
  id: string;
  title: string;
  text: string;
  url: string;
}>> {
  const result = await defaultTools.search(query, options);
  
  if (!result.success) {
    throw new Error(result.error?.message || 'Search failed');
  }
  
  return result.data || [];
}

export async function fetch(id: string): Promise<{
  id: string;
  title: string;
  text: string;
  url: string;
  metadata?: Record<string, any>;
}> {
  const result = await defaultTools.fetch(id);
  
  if (!result.success) {
    throw new Error(result.error?.message || 'Fetch failed');
  }
  
  if (!result.data) {
    throw new Error('No data returned from fetch');
  }
  
  return result.data;
}