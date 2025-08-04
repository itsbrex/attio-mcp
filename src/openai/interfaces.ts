/**
 * OpenAI Tool Interfaces
 * Main interfaces for the search and fetch tools that ChatGPT will use
 */

import {
  OpenAISearchResult,
  OpenAIFetchResult,
  OpenAISearchOptions,
  OpenAIToolResponse,
  OpenAISearchContext,
  OpenAIFetchContext,
} from '../types/openai-types.js';

/**
 * Main search interface that ChatGPT will use
 * Searches across all Attio data types and returns OpenAI-formatted results
 */
export interface IOpenAISearchTool {
  /**
   * Search across Attio CRM data
   * @param query - Search query string
   * @param options - Optional search configuration
   * @returns Promise of search results in OpenAI format
   */
  search(
    query: string,
    options?: OpenAISearchOptions
  ): Promise<OpenAIToolResponse<OpenAISearchResult[]>>;
}

/**
 * Main fetch interface that ChatGPT will use
 * Fetches detailed information about a specific record
 */
export interface IOpenAIFetchTool {
  /**
   * Fetch detailed information about a specific record
   * @param id - Unique identifier of the record to fetch
   * @param options - Optional fetch configuration
   * @returns Promise of detailed record data in OpenAI format
   */
  fetch(
    id: string,
    options?: { includeRelated?: boolean }
  ): Promise<OpenAIToolResponse<OpenAIFetchResult>>;
}

/**
 * Combined interface for both search and fetch operations
 */
export interface IOpenAITools extends IOpenAISearchTool, IOpenAIFetchTool {}

/**
 * Interface for transforming Attio data to OpenAI format
 */
export interface IOpenAIDataTransformer {
  /**
   * Transform an Attio record to OpenAI search result format
   */
  transformToSearchResult(
    record: any,
    query: string,
    objectType: string
  ): OpenAISearchResult;

  /**
   * Transform an Attio record to OpenAI fetch result format
   */
  transformToFetchResult(
    record: any,
    objectType: string,
    includeRelated?: boolean
  ): OpenAIFetchResult;

  /**
   * Generate a URL for accessing the record in Attio
   */
  generateUrl(id: string, objectType: string): string;

  /**
   * Extract relevant text content from an Attio record
   */
  extractTextContent(record: any, objectType: string): string;

  /**
   * Create a human-readable title from an Attio record
   */
  createTitle(record: any, objectType: string): string;
}

/**
 * Interface for search relevance scoring
 */
export interface IOpenAIRelevanceScorer {
  /**
   * Calculate relevance score for a search result
   */
  calculateRelevance(
    record: any,
    query: string,
    objectType: string
  ): Promise<number>;

  /**
   * Rank search results by relevance
   */
  rankResults(
    results: OpenAISearchResult[],
    query: string
  ): Promise<OpenAISearchResult[]>;
}

/**
 * Interface for caching search and fetch results
 */
export interface IOpenAICache {
  /**
   * Get cached search results
   */
  getSearchResults(
    query: string,
    options?: OpenAISearchOptions
  ): Promise<OpenAISearchResult[] | null>;

  /**
   * Cache search results
   */
  setSearchResults(
    query: string,
    results: OpenAISearchResult[],
    options?: OpenAISearchOptions
  ): Promise<void>;

  /**
   * Get cached fetch result
   */
  getFetchResult(id: string): Promise<OpenAIFetchResult | null>;

  /**
   * Cache fetch result
   */
  setFetchResult(id: string, result: OpenAIFetchResult): Promise<void>;

  /**
   * Clear cache
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    size: number;
  };
}

/**
 * Interface for integrating with SSE transport
 */
export interface IOpenAISSEIntegration {
  /**
   * Handle search request via SSE
   */
  handleSSESearch(
    clientId: string,
    query: string,
    options?: OpenAISearchOptions
  ): Promise<void>;

  /**
   * Handle fetch request via SSE
   */
  handleSSEFetch(
    clientId: string,
    id: string,
    options?: { includeRelated?: boolean }
  ): Promise<void>;

  /**
   * Send progress updates during long-running operations
   */
  sendProgress(
    clientId: string,
    operation: 'search' | 'fetch',
    progress: {
      stage: string;
      percentage: number;
      message?: string;
    }
  ): void;
}