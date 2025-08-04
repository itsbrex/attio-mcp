/**
 * OpenAI-compliant types for ChatGPT connector integration
 * These types match the exact format expected by ChatGPT connectors
 */

export interface OpenAISearchResult {
  /** Unique identifier for the result */
  id: string;
  /** Human-readable title/name of the result */
  title: string;
  /** Detailed text content or description */
  text: string;
  /** URL to access the full resource (optional but recommended) */
  url: string;
}

export interface OpenAIFetchResult {
  /** Unique identifier for the fetched resource */
  id: string;
  /** Human-readable title/name of the resource */
  title: string;
  /** Complete text content or description */
  text: string;
  /** URL to access the resource (optional but recommended) */
  url: string;
  /** Additional structured metadata (optional) */
  metadata?: Record<string, any>;
}

export interface OpenAISearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Object types to search (defaults to all types) */
  types?: string[];
  /** Whether to include related data in results */
  includeRelated?: boolean;
  /** Minimum relevance score (0-1) */
  minRelevance?: number;
}

export interface OpenAISearchContext {
  /** Search query string */
  query: string;
  /** Original request options */
  options?: OpenAISearchOptions;
  /** Timestamp of the search */
  timestamp: string;
  /** Client identifier for the request */
  clientId?: string;
}

export interface OpenAIFetchContext {
  /** Resource ID to fetch */
  id: string;
  /** Whether to include related data */
  includeRelated?: boolean;
  /** Timestamp of the fetch */
  timestamp: string;
  /** Client identifier for the request */
  clientId?: string;
}

/**
 * Search relevance scoring interface
 */
export interface SearchRelevanceScore {
  /** Overall relevance score (0-1) */
  score: number;
  /** Breakdown of scoring factors */
  factors: {
    /** Text similarity score */
    textMatch: number;
    /** Recency score (newer = higher) */
    recency: number;
    /** Interaction frequency score */
    frequency: number;
    /** Data completeness score */
    completeness: number;
  };
  /** Explanation of why this result was scored this way */
  explanation?: string;
}

/**
 * Enhanced search result with relevance information
 */
export interface EnhancedOpenAISearchResult extends OpenAISearchResult {
  /** Relevance scoring information */
  relevance: SearchRelevanceScore;
  /** Type of Attio object (company, person, etc.) */
  objectType: string;
  /** When this record was last updated */
  lastUpdated?: string;
}

/**
 * Search performance metrics
 */
export interface SearchMetrics {
  /** Total search time in milliseconds */
  searchTime: number;
  /** Number of results found */
  resultCount: number;
  /** Number of Attio objects searched */
  objectsSearched: number;
  /** Whether results were cached */
  wasCached: boolean;
  /** Cache hit/miss information */
  cacheInfo?: {
    hit: boolean;
    key: string;
    ttl?: number;
  };
}

/**
 * Error types for OpenAI tools
 */
export interface OpenAIToolError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: any;
  /** Timestamp when error occurred */
  timestamp: string;
}

/**
 * Response wrapper for OpenAI tools
 */
export interface OpenAIToolResponse<T> {
  /** Whether the operation was successful */
  success: boolean;
  /** Response data (present on success) */
  data?: T;
  /** Error information (present on failure) */
  error?: OpenAIToolError;
  /** Performance metrics */
  metrics?: SearchMetrics;
  /** Request context */
  context: OpenAISearchContext | OpenAIFetchContext;
}

/**
 * Cache configuration for OpenAI tools
 */
export interface OpenAICacheConfig {
  /** Whether caching is enabled */
  enabled: boolean;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Maximum cache size (number of entries) */
  maxSize: number;
  /** Cache key prefix */
  keyPrefix: string;
}

/**
 * Configuration for OpenAI-compliant tools
 */
export interface OpenAIToolsConfig {
  /** Base URL for generating resource links */
  baseUrl?: string;
  /** Default search options */
  defaultSearchOptions: OpenAISearchOptions;
  /** Cache configuration */
  cache: OpenAICacheConfig;
  /** Whether to include debug information */
  debug: boolean;
  /** Maximum concurrent operations */
  maxConcurrency: number;
}