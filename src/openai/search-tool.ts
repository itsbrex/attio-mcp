/**
 * OpenAI-compliant Search Tool Implementation
 * Provides ChatGPT-compatible search functionality across Attio CRM data
 */

import {
  OpenAISearchResult,
  OpenAISearchOptions,
  OpenAIToolResponse,
  OpenAISearchContext,
  SearchMetrics,
  OpenAIToolError,
  EnhancedOpenAISearchResult,
} from '../types/openai-types.js';
import { IOpenAISearchTool, IOpenAIDataTransformer, IOpenAIRelevanceScorer } from './interfaces.js';
import { searchObject, advancedSearchObject } from '../api/operations/search.js';
import { ResourceType, AttioRecord } from '../types/attio.js';
import { OpenAIDataTransformer } from './data-transformer.js';
import { OpenAIRelevanceScorer } from './relevance-scorer.js';

/**
 * OpenAI-compliant search tool implementation
 */
export class OpenAISearchTool implements IOpenAISearchTool {
  private transformer: IOpenAIDataTransformer;
  private relevanceScorer: IOpenAIRelevanceScorer;
  private defaultOptions: OpenAISearchOptions;

  constructor(
    transformer?: IOpenAIDataTransformer,
    relevanceScorer?: IOpenAIRelevanceScorer,
    defaultOptions?: OpenAISearchOptions
  ) {
    this.transformer = transformer || new OpenAIDataTransformer();
    this.relevanceScorer = relevanceScorer || new OpenAIRelevanceScorer();
    this.defaultOptions = {
      limit: 20,
      types: ['people', 'companies', 'lists', 'tasks'],
      includeRelated: false,
      minRelevance: 0.1,
      ...defaultOptions,
    };
  }

  /**
   * Search across Attio CRM data
   */
  async search(
    query: string,
    options?: OpenAISearchOptions
  ): Promise<OpenAIToolResponse<OpenAISearchResult[]>> {
    const startTime = Date.now();
    const searchOptions = { ...this.defaultOptions, ...options };
    const context: OpenAISearchContext = {
      query,
      options: searchOptions,
      timestamp: new Date().toISOString(),
    };

    try {
      console.log(`[OpenAI Search] Starting search for: "${query}"`);

      // Validate input
      if (!query || query.trim().length === 0) {
        throw new Error('Search query cannot be empty');
      }

      if (query.length > 500) {
        throw new Error('Search query too long (max 500 characters)');
      }

      // Determine which object types to search
      const typesToSearch = this.getSearchTypes(searchOptions.types);
      console.log(`[OpenAI Search] Searching types: ${typesToSearch.join(', ')}`);

      // Execute searches across all specified types
      const searchPromises = typesToSearch.map(async (objectType) => {
        try {
          const resourceType = this.mapToResourceType(objectType);
          const records = await this.searchObjectType(query, resourceType, searchOptions);
          
          // Transform each record to OpenAI format
          const transformedResults = records.map((record) =>
            this.transformer.transformToSearchResult(record, query, objectType)
          );

          console.log(`[OpenAI Search] Found ${transformedResults.length} results for ${objectType}`);
          return transformedResults;
        } catch (error) {
          console.warn(`[OpenAI Search] Error searching ${objectType}:`, error);
          return []; // Return empty array for failed searches to continue with other types
        }
      });

      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);
      const allResults = searchResults.flat();

      console.log(`[OpenAI Search] Total results before filtering: ${allResults.length}`);

      // Apply relevance scoring and filtering
      const scoredResults = await this.scoreAndFilterResults(allResults, query, searchOptions);

      // Apply limit
      const limitedResults = scoredResults.slice(0, searchOptions.limit);

      const endTime = Date.now();
      const metrics: SearchMetrics = {
        searchTime: endTime - startTime,
        resultCount: limitedResults.length,
        objectsSearched: typesToSearch.length,
        wasCached: false, // TODO: Implement caching
      };

      console.log(`[OpenAI Search] Completed in ${metrics.searchTime}ms, returning ${limitedResults.length} results`);

      return {
        success: true,
        data: limitedResults,
        metrics,
        context,
      };

    } catch (error) {
      const endTime = Date.now();
      const toolError: OpenAIToolError = {
        code: 'SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown search error',
        details: error,
        timestamp: new Date().toISOString(),
      };

      console.error('[OpenAI Search] Search failed:', toolError);

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
   * Get the list of object types to search based on options
   */
  private getSearchTypes(types?: string[]): string[] {
    if (!types || types.length === 0) {
      return this.defaultOptions.types || ['people', 'companies', 'lists', 'tasks'];
    }
    return types;
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
   * Search a specific object type
   */
  private async searchObjectType(
    query: string,
    resourceType: ResourceType,
    options: OpenAISearchOptions
  ): Promise<AttioRecord[]> {
    try {
      // Use simple search for most cases, advanced search for complex queries
      if (this.isSimpleQuery(query)) {
        return await searchObject(resourceType, query);
      } else {
        // For complex queries, use advanced search with dynamic filters
        const filters = this.buildAdvancedFilters(query, resourceType);
        return await advancedSearchObject(resourceType, filters, options.limit);
      }
    } catch (error) {
      console.warn(`[OpenAI Search] Failed to search ${resourceType}:`, error);
      return []; // Return empty array to continue with other searches
    }
  }

  /**
   * Determine if a query is simple (single word/phrase) or complex
   */
  private isSimpleQuery(query: string): boolean {
    // Simple heuristic: if query has no special operators or multiple conditions
    const hasOperators = /\b(AND|OR|NOT)\b/i.test(query);
    const hasQuotes = query.includes('"');
    const hasFilters = /\b(created|updated|type|status):/i.test(query);
    
    return !hasOperators && !hasQuotes && !hasFilters;
  }

  /**
   * Build advanced filters for complex queries
   */
  private buildAdvancedFilters(query: string, resourceType: ResourceType): any {
    // Basic implementation - can be enhanced with natural language processing
    const filters: any = {
      filters: [],
      matchAny: false, // Use AND logic by default
    };

    // Extract quoted phrases for exact matching
    const quotedPhrases = query.match(/"([^"]+)"/g);
    if (quotedPhrases) {
      quotedPhrases.forEach((phrase) => {
        const cleanPhrase = phrase.replace(/"/g, '');
        filters.filters.push({
          attribute: 'name',
          operator: 'contains',
          value: cleanPhrase,
        });
      });
    }

    // If no specific filters, fall back to general text search
    if (filters.filters.length === 0) {
      if (resourceType === ResourceType.PEOPLE) {
        filters.filters = [
          { attribute: 'name', operator: 'contains', value: query },
          { attribute: 'email_addresses', operator: 'contains', value: query },
        ];
        filters.matchAny = true; // Use OR logic for people search
      } else {
        filters.filters.push({
          attribute: 'name',
          operator: 'contains',
          value: query,
        });
      }
    }

    return filters;
  }

  /**
   * Score and filter results based on relevance
   */
  private async scoreAndFilterResults(
    results: OpenAISearchResult[],
    query: string,
    options: OpenAISearchOptions
  ): Promise<OpenAISearchResult[]> {
    console.log(`[OpenAI Search] Scoring ${results.length} results`);

    // Score each result for relevance
    const scoredResults: EnhancedOpenAISearchResult[] = [];

    for (const result of results) {
      try {
        const relevanceScore = await this.relevanceScorer.calculateRelevance(
          result,
          query,
          'generic' // TODO: Pass actual object type
        );

        if (relevanceScore >= (options.minRelevance || 0.1)) {
          scoredResults.push({
            ...result,
            relevance: {
              score: relevanceScore,
              factors: {
                textMatch: 0.8, // TODO: Calculate actual factors
                recency: 0.5,
                frequency: 0.3,
                completeness: 0.7,
              },
            },
            objectType: 'generic', // TODO: Determine actual object type
          });
        }
      } catch (error) {
        console.warn('[OpenAI Search] Error scoring result:', error);
        // Include result with default score to avoid losing data
        scoredResults.push({
          ...result,
          relevance: {
            score: 0.5,
            factors: {
              textMatch: 0.5,
              recency: 0.5,
              frequency: 0.5,
              completeness: 0.5,
            },
          },
          objectType: 'generic',
        });
      }
    }

    // Sort by relevance score (highest first)
    const sortedResults = scoredResults.sort((a, b) => b.relevance.score - a.relevance.score);

    console.log(`[OpenAI Search] After scoring and filtering: ${sortedResults.length} results`);
    
    return sortedResults;
  }
}