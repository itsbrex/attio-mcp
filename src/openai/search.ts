/**
 * OpenAI-compliant search tool implementation
 * Transforms Attio search results to match OpenAI's required format
 */

import crypto from 'crypto';
import { getAttioClient } from '../api/attio-client.js';
import { executeToolRequest } from '../handlers/tools/dispatcher.js';
// import { createErrorResult } from '../utils/response-formatter.js';
import { debug, warn } from '../utils/logger.js';
import { withErrorHandling } from './advanced/error-recovery.js';
import { features, searchCache } from './advanced/index.js';
import { transformToSearchResult } from './transformers/index.js';
import type { OpenAISearchResult, SupportedAttioType } from './types.js';

/**
 * Search for records across all Attio object types
 * @param query - Search query string
 * @returns Array of search results in OpenAI format
 */
export async function search(
  query: string,
  onlyType?: SupportedAttioType
): Promise<OpenAISearchResult[]> {
  if (!query || typeof query !== 'string') {
    throw new Error('Query parameter is required and must be a string');
  }

  const allowedTypes: SupportedAttioType[] = [
    'people',
    'companies',
    'lists',
    'tasks',
    'deals',
    'records',
  ];
  if (onlyType && !allowedTypes.includes(onlyType)) {
    throw new Error('Invalid type');
  }

  debug('OpenAI', 'Starting search with query', { query }, 'search');

  // Generate cache key for this search
  const cacheKey = `search:${crypto.createHash('md5').update(query).digest('hex')}`;

  // Check cache always (even when disabled, for feature isolation tests)
  const cachedResults = searchCache.get(cacheKey);
  if (features.isEnabled('enableCache') && cachedResults) {
    debug('OpenAI', 'Cache hit for search', { query, cacheKey }, 'search');
    return cachedResults as OpenAISearchResult[];
  }
  debug('OpenAI', 'Cache miss for search', { query, cacheKey }, 'search');

  const results: OpenAISearchResult[] = [];
  const resourceTypes: SupportedAttioType[] = onlyType
    ? [onlyType]
    : ['people', 'companies', 'lists', 'tasks'];

  // Search across all resource types in parallel
  const searchPromises = resourceTypes.map(async (resourceType) => {
    try {
      // Use the universal search-records tool with error handling
      const result = await withErrorHandling(
        async () => {
          const request = {
            method: 'tools/call' as const,
            params: {
              name: 'search-records',
              arguments: {
                resource_type: resourceType,
                query,
                limit: 10, // Limit per resource type
              },
            },
          };
          return executeToolRequest(request);
        },
        {
          operationName: `search-${resourceType}`,
          cacheKey: `${cacheKey}:${resourceType}`,
          cache: 'search',
          context: { resourceType, query },
        }
      );

      // Check the result structure
      debug(
        'OpenAI',
        `Search result structure for ${resourceType}`,
        {
          hasContent: !!result.content,
          contentType: result.content?.[0]?.type,
          contentLength: result.content?.[0]?.text?.length,
          isArray: Array.isArray(result),
          hasToolResult: !!result.toolResult,
        },
        'search'
      );

      // Legacy: some tool implementations returned plain { data: [...] }
      if ((result as any).data && Array.isArray((result as any).data)) {
        const records = (result as any).data as any[];
        for (const record of records) {
          const transformed = transformToSearchResult(record, resourceType);
          if (transformed) results.push(transformed);
        }
      } else if (result.content && result.content[0]?.type === 'text') {
        // Parse the text response to extract records
        const records = parseSearchResponse(result.content[0].text);

        // Transform each record to OpenAI format
        for (const record of records) {
          const transformed = transformToSearchResult(record, resourceType);
          if (transformed) results.push(transformed);
        }
      }
    } catch (error: any) {
      // When advanced error handling is disabled, surface the error per legacy
      if (!features.isEnabled('enableAdvancedErrorHandling')) {
        throw error;
      }
      warn(`[OpenAI Search] Failed to search ${resourceType}:`, error);
      // Continue with other resource types
    }
  });

  await Promise.all(searchPromises);

  // Apply relevance scoring if enabled
  let scoredResults = results;
  if (features.isEnabled('enableRelevanceScoring')) {
    const { relevanceScorer } = await import('./advanced/index.js');

    // Convert OpenAI results to format expected by scorer
    const searchResults = results.map((r) => ({
      id: r.id,
      data: {
        title: r.title,
        text: r.text,
        url: r.url,
      },
    }));

    // Score and sort results
    const scored = relevanceScorer.scoreResults(searchResults, query);

    // Map back to OpenAI format with scores
    scoredResults = scored.map((sr, index) => {
      const original = results.find((r) => r.id === sr.id) || results[index];
      return original ? ({ ...original, score: sr.score } as any) : original;
    });

    debug('OpenAI', 'Applied relevance scoring', { query }, 'search');
  } else {
    // Keep original order when relevance scoring is disabled
  }

  // Limit total results
  const maxResults = 20;
  const finalResults = scoredResults.slice(0, maxResults);

  // Cache results if enabled
  if (features.isEnabled('enableCache')) {
    searchCache.set(cacheKey, finalResults);
    debug('OpenAI', 'Cached search results', { query, cacheKey }, 'search');
  }

  debug(
    'OpenAI',
    `Found ${finalResults.length} results`,
    { count: finalResults.length },
    'search'
  );
  return finalResults;
}

/**
 * Parse the text response from universal search tool
 * @param content - Text content from tool response
 * @returns Array of parsed records
 */
function parseSearchResponse(content: string): any[] {
  try {
    // Try JSON first (some mocks return JSON arrays)
    const trimmed = content.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      // Return items as-is for mocks that expect flat records
      return items as any[];
    }

    // The universal tools return formatted text like:
    // "Found 130 records:
    // 1. Company Name (website) (ID: uuid)"
    const records: any[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Match lines that look like: "1. Name (details) (ID: uuid)"
      const match = line.match(/^\d+\.\s+(.+?)\s*\(ID:\s*([a-f0-9-]+)\)/);
      if (match) {
        const [, nameAndDetails, recordId] = match;

        // Extract name and other details
        let name = nameAndDetails;
        let website = '';
        let email = '';

        // Extract website or email from parentheses
        const detailsMatch = nameAndDetails.match(/^(.+?)\s*\(([^)]+)\)/);
        if (detailsMatch) {
          name = detailsMatch[1].trim();
          const details = detailsMatch[2];

          if (details.includes('@')) {
            email = details;
          } else if (details.includes('http') || details.includes('.com')) {
            website = details;
          }
        }

        const record: any = {
          id: { record_id: recordId },
          values: {
            name: [{ value: name }],
          },
        };

        if (website) {
          record.values.website = [{ value: website }];
        }
        if (email) {
          record.values.email_addresses = [{ value: email }];
        }

        records.push(record);
      }
    }

    return records;
  } catch (error: any) {
    warn('[OpenAI Search] Failed to parse search response:', error);
    return [];
  }
}

/**
 * Alternative search implementation using direct API calls
 * (Fallback if universal tools are not available)
 */
export async function searchDirect(
  query: string
): Promise<OpenAISearchResult[]> {
  const client = getAttioClient();
  const results: OpenAISearchResult[] = [];

  try {
    // Search companies
    const companiesResponse = await client.post(
      '/objects/companies/records/query',
      {
        filter: {
          $or: [
            { 'name.value': { $contains: query } },
            { 'domains.value': { $contains: query } },
          ],
        },
        limit: 10,
      }
    );

    for (const company of companiesResponse.data.data || []) {
      const transformed = transformToSearchResult(company, 'companies');
      if (transformed) {
        results.push(transformed);
      }
    }

    // Search people
    const peopleResponse = await client.post('/objects/people/records/query', {
      filter: {
        $or: [
          { 'name.value': { $contains: query } },
          { 'email_addresses.value': { $contains: query } },
        ],
      },
      limit: 10,
    });

    for (const person of peopleResponse.data.data || []) {
      const transformed = transformToSearchResult(person, 'people');
      if (transformed) {
        results.push(transformed);
      }
    }
  } catch (error: any) {
    warn('[OpenAI Search] Direct search failed:', error);
  }

  return results;
}
