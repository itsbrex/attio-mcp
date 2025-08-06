/**
 * Error Recovery Integration Module
 * Combines error handling with cache fallback capabilities
 */

import { advancedErrorHandler, ErrorCategory } from './error-handler.js';
import { searchCache, recordCache, attributeCache } from './cache.js';
import { features } from '../../config/features.js';

/**
 * Execute search operation with cache fallback on errors
 */
export async function executeSearchWithFallback<T>(
  operation: () => Promise<T>,
  cacheKey: string,
  context?: Record<string, any>
): Promise<T> {
  if (!features.isEnabled('enableAdvancedErrorHandling') || !features.isEnabled('enableCache')) {
    return operation();
  }

  return advancedErrorHandler.executeWithCustomRecovery(
    operation,
    {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      fallbackAction: async () => {
        // Try to get from cache on error
        const cached = searchCache.get(cacheKey);
        if (cached) {
          if (features.isEnabled('enableEnhancedLogging')) {
            console.log('[ErrorRecovery] Falling back to cached search results');
          }
          return cached as T;
        }
        throw new Error('No cached results available for fallback');
      },
      context,
    }
  );
}

/**
 * Execute record fetch operation with cache fallback on errors
 */
export async function executeFetchWithFallback<T>(
  operation: () => Promise<T>,
  cacheKey: string,
  context?: Record<string, any>
): Promise<T> {
  if (!features.isEnabled('enableAdvancedErrorHandling') || !features.isEnabled('enableCache')) {
    return operation();
  }

  return advancedErrorHandler.executeWithCustomRecovery(
    operation,
    {
      maxRetries: 2,
      retryDelay: 1500,
      backoffMultiplier: 1.5,
      fallbackAction: async () => {
        // Try to get from cache on error
        const cached = recordCache.get(cacheKey);
        if (cached) {
          if (features.isEnabled('enableEnhancedLogging')) {
            console.log('[ErrorRecovery] Falling back to cached record data');
          }
          return cached as T;
        }
        throw new Error('No cached record available for fallback');
      },
      context,
    }
  );
}

/**
 * Execute attribute operation with cache fallback on errors
 */
export async function executeAttributeOperationWithFallback<T>(
  operation: () => Promise<T>,
  cacheKey: string,
  context?: Record<string, any>
): Promise<T> {
  if (!features.isEnabled('enableAdvancedErrorHandling') || !features.isEnabled('enableCache')) {
    return operation();
  }

  return advancedErrorHandler.executeWithCustomRecovery(
    operation,
    {
      maxRetries: 2,
      retryDelay: 1000,
      backoffMultiplier: 1.5,
      fallbackAction: async () => {
        // Try to get from cache on error
        const cached = attributeCache.get(cacheKey);
        if (cached) {
          if (features.isEnabled('enableEnhancedLogging')) {
            console.log('[ErrorRecovery] Falling back to cached attribute data');
          }
          return cached as T;
        }
        throw new Error('No cached attributes available for fallback');
      },
      context,
    }
  );
}

/**
 * Configure error handler with cache fallback for specific categories
 */
export function configureCacheFallbacks(): void {
  if (!features.isEnabled('enableCache')) {
    return;
  }

  // Set fallback for network errors
  advancedErrorHandler.setFallbackAction(ErrorCategory.NETWORK, async () => {
    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[ErrorRecovery] Network error - attempting cache fallback');
    }
    // Return a generic error response that indicates cache was used
    return {
      data: [],
      fromCache: true,
      error: 'Network error - returning cached data if available',
    };
  });

  // Set fallback for timeout errors
  advancedErrorHandler.setFallbackAction(ErrorCategory.TIMEOUT, async () => {
    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[ErrorRecovery] Timeout error - attempting cache fallback');
    }
    return {
      data: [],
      fromCache: true,
      error: 'Operation timed out - returning cached data if available',
    };
  });

  // Set fallback for service unavailable errors
  advancedErrorHandler.setFallbackAction(ErrorCategory.SERVICE_UNAVAILABLE, async () => {
    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[ErrorRecovery] Service unavailable - attempting cache fallback');
    }
    return {
      data: [],
      fromCache: true,
      error: 'Service temporarily unavailable - returning cached data if available',
    };
  });
}

/**
 * Wrap an async operation with comprehensive error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options?: {
    operationName?: string;
    cacheKey?: string;
    cache?: 'search' | 'record' | 'attribute';
    context?: Record<string, any>;
  }
): Promise<T> {
  if (!features.isEnabled('enableAdvancedErrorHandling')) {
    return operation();
  }

  const startTime = Date.now();
  
  try {
    // If cache is specified, use appropriate fallback method
    if (options?.cache && options?.cacheKey) {
      switch (options.cache) {
        case 'search':
          return await executeSearchWithFallback(operation, options.cacheKey, options.context);
        case 'record':
          return await executeFetchWithFallback(operation, options.cacheKey, options.context);
        case 'attribute':
          return await executeAttributeOperationWithFallback(operation, options.cacheKey, options.context);
      }
    }

    // Otherwise use standard retry logic
    return await advancedErrorHandler.executeWithRetry(operation, options?.context);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (features.isEnabled('enableEnhancedLogging')) {
      console.error(`[ErrorRecovery] Operation ${options?.operationName || 'unknown'} failed after ${duration}ms`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        context: options?.context,
      });
    }
    
    throw error;
  }
}

// Initialize cache fallbacks on module load
if (features.isEnabled('enableAdvancedErrorHandling') && features.isEnabled('enableCache')) {
  configureCacheFallbacks();
}