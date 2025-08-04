/**
 * OpenAI Tools - Phase 2 Implementation
 * 
 * This module provides OpenAI-compliant search and fetch tools for ChatGPT connector integration.
 * It transforms Attio CRM data into the exact format required by ChatGPT connectors.
 */

// Main tool implementations
export { OpenAITools, createOpenAITools, search, fetch } from './tools.js';
export { OpenAISearchTool } from './search-tool.js';
export { OpenAIFetchTool } from './fetch-tool.js';

// Utilities and transformers
export { OpenAIDataTransformer } from './data-transformer.js';
export { OpenAIRelevanceScorer } from './relevance-scorer.js';
export { OpenAICache } from './cache.js';

// SSE integration
export { OpenAISSEIntegration } from './sse-integration.js';

// Interfaces
export type {
  IOpenAISearchTool,
  IOpenAIFetchTool,
  IOpenAITools,
  IOpenAIDataTransformer,
  IOpenAIRelevanceScorer,
  IOpenAICache,
  IOpenAISSEIntegration,
} from './interfaces.js';

// Types
export type {
  OpenAISearchResult,
  OpenAIFetchResult,
  OpenAISearchOptions,
  OpenAISearchContext,
  OpenAIFetchContext,
  OpenAIToolResponse,
  OpenAIToolError,
  OpenAIToolsConfig,
  OpenAICacheConfig,
  SearchRelevanceScore,
  EnhancedOpenAISearchResult,
  SearchMetrics,
} from '../types/openai-types.js';

/**
 * Quick setup function for ChatGPT connector integration
 */
export function setupOpenAIConnector(options?: {
  baseUrl?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  defaultLimit?: number;
  debug?: boolean;
}) {
  const config = {
    baseUrl: options?.baseUrl || 'https://app.attio.com',
    defaultSearchOptions: {
      limit: options?.defaultLimit || 20,
      types: ['people', 'companies', 'lists', 'tasks'],
      includeRelated: false,
      minRelevance: 0.1,
    },
    cache: {
      enabled: options?.cacheEnabled !== false,
      ttl: options?.cacheTTL || 5 * 60 * 1000,
      maxSize: 1000,
      keyPrefix: 'openai:',
    },
    debug: options?.debug || process.env.NODE_ENV === 'development',
    maxConcurrency: 10,
  };

  const tools = createOpenAITools(config);
  
  console.log('[OpenAI Connector] Setup complete with configuration:', {
    baseUrl: config.baseUrl,
    cacheEnabled: config.cache.enabled,
    defaultLimit: config.defaultSearchOptions.limit,
    debug: config.debug,
  });

  return {
    tools,
    search: tools.search.bind(tools),
    fetch: tools.fetch.bind(tools),
    config: tools.getConfig.bind(tools),
    stats: tools.getStats.bind(tools),
    healthCheck: tools.healthCheck.bind(tools),
  };
}

/**
 * Integration with SSE server from Phase 1
 */
export function integrateWithSSE(sseServer: any) {
  const tools = createOpenAITools();
  const integration = new OpenAISSEIntegration(sseServer, tools);
  
  console.log('[OpenAI SSE] Integration established between OpenAI tools and SSE server');
  
  return {
    integration,
    tools,
    handleSearch: integration.handleSSESearch.bind(integration),
    handleFetch: integration.handleSSEFetch.bind(integration),
    handleMessage: integration.handleMCPMessage.bind(integration),
  };
}