/**
 * Tests for advanced error handling system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AdvancedErrorHandler,
  ErrorCategory,
  ErrorSeverity,
} from '../../src/openai/advanced/error-handler.js';
import {
  withErrorHandling,
  executeSearchWithFallback,
  executeFetchWithFallback,
} from '../../src/openai/advanced/error-recovery.js';
import { searchCache, recordCache } from '../../src/openai/advanced/cache.js';
import { features } from '../../src/config/features.js';

describe('Advanced Error Handling', () => {
  let errorHandler: AdvancedErrorHandler;

  beforeEach(() => {
    errorHandler = new AdvancedErrorHandler();
    // Enable advanced error handling for tests
    features.updateFlags({
      enableAdvancedErrorHandling: true,
      enableCache: true,
      enableEnhancedLogging: false,
    });
    // Clear caches
    searchCache.clear();
    recordCache.clear();
  });

  afterEach(() => {
    // Reset features
    features.reset();
    vi.clearAllMocks();
  });

  describe('Error Categorization', () => {
    it('should categorize network errors correctly', () => {
      const networkError = new Error('ECONNREFUSED');
      expect(errorHandler.categorizeError(networkError)).toBe(
        ErrorCategory.NETWORK
      );

      const networkError2 = new Error('Network timeout');
      expect(errorHandler.categorizeError(networkError2)).toBe(
        ErrorCategory.TIMEOUT
      );
    });

    it('should categorize rate limit errors', () => {
      const rateLimitError = { message: 'rate limit exceeded', code: 429 };
      expect(errorHandler.categorizeError(rateLimitError)).toBe(
        ErrorCategory.RATE_LIMIT
      );
    });

    it('should categorize permission errors', () => {
      const authError = { message: 'unauthorized', code: 401 };
      expect(errorHandler.categorizeError(authError)).toBe(
        ErrorCategory.PERMISSION
      );

      const forbiddenError = { message: 'forbidden access', code: 403 };
      expect(errorHandler.categorizeError(forbiddenError)).toBe(
        ErrorCategory.PERMISSION
      );
    });

    it('should categorize validation errors', () => {
      const validationError = { message: 'invalid input', code: 400 };
      expect(errorHandler.categorizeError(validationError)).toBe(
        ErrorCategory.VALIDATION
      );

      const malformedError = { message: 'malformed request', code: 422 };
      expect(errorHandler.categorizeError(malformedError)).toBe(
        ErrorCategory.VALIDATION
      );
    });

    it('should categorize resource not found errors', () => {
      const notFoundError = { message: 'resource not found', code: 404 };
      expect(errorHandler.categorizeError(notFoundError)).toBe(
        ErrorCategory.RESOURCE_NOT_FOUND
      );
    });

    it('should categorize conflict errors', () => {
      const conflictError = { message: 'resource already exists', code: 409 };
      expect(errorHandler.categorizeError(conflictError)).toBe(
        ErrorCategory.CONFLICT
      );
    });

    it('should categorize service unavailable errors', () => {
      const serviceError = { message: 'service unavailable', code: 503 };
      expect(errorHandler.categorizeError(serviceError)).toBe(
        ErrorCategory.SERVICE_UNAVAILABLE
      );
    });

    it('should categorize quota exceeded errors', () => {
      const quotaError = { message: 'quota exceeded', code: 402 };
      expect(errorHandler.categorizeError(quotaError)).toBe(
        ErrorCategory.QUOTA_EXCEEDED
      );
    });

    it('should categorize unknown errors', () => {
      const unknownError = new Error('something weird happened');
      expect(errorHandler.categorizeError(unknownError)).toBe(
        ErrorCategory.UNKNOWN
      );
    });
  });

  describe('Error Severity', () => {
    it('should determine critical severity for permission and config errors', () => {
      const severity = errorHandler.determineSeverity(
        new Error('unauthorized'),
        ErrorCategory.PERMISSION
      );
      expect(severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should determine high severity for data integrity and API errors', () => {
      const severity = errorHandler.determineSeverity(
        new Error('integrity constraint'),
        ErrorCategory.DATA_INTEGRITY
      );
      expect(severity).toBe(ErrorSeverity.HIGH);
    });

    it('should determine medium severity for network and rate limit errors', () => {
      const severity = errorHandler.determineSeverity(
        new Error('network error'),
        ErrorCategory.NETWORK
      );
      expect(severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should determine low severity for unknown errors', () => {
      const severity = errorHandler.determineSeverity(
        new Error('unknown'),
        ErrorCategory.UNKNOWN
      );
      expect(severity).toBe(ErrorSeverity.LOW);
    });
  });

  describe('Retry Logic', () => {
    it('should retry network errors with exponential backoff', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      const result = await errorHandler.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn(async () => {
        throw new Error('unauthorized');
      });

      await expect(errorHandler.executeWithRetry(operation)).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect max retries limit', async () => {
      const operation = vi.fn(async () => {
        throw new Error('network error');
      });

      await expect(errorHandler.executeWithRetry(operation)).rejects.toThrow();
      // Network errors have maxRetries = 3
      expect(operation).toBeCalledTimes(4); // Initial + 3 retries
    });

    it('should use custom recovery options', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          // Throw a retryable error
          const error = new Error('network error');
          throw error;
        }
        return 'success';
      });

      const result = await errorHandler.executeWithCustomRecovery(operation, {
        maxRetries: 2,
        retryDelay: 100,
        backoffMultiplier: 1.5,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use fallback action on failure', async () => {
      const operation = vi.fn(async () => {
        // Throw a retryable error so it will retry
        throw new Error('network error');
      });

      const fallback = vi.fn(async () => 'fallback result');

      const result = await errorHandler.executeWithCustomRecovery(operation, {
        maxRetries: 1,
        fallbackAction: fallback,
      });

      expect(result).toBe('fallback result');
      expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
      expect(fallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Fallback Integration', () => {
    it('should fall back to cached search results on error', async () => {
      const cacheKey = 'test-search';
      const cachedData = [{ id: '1', title: 'Cached Result' }];

      // Pre-populate cache
      searchCache.set(cacheKey, cachedData);

      const operation = vi.fn(async () => {
        throw new Error('network error');
      });

      const result = await executeSearchWithFallback(operation, cacheKey);

      expect(result).toEqual(cachedData);
      expect(operation).toHaveBeenCalled();
    });

    it('should fall back to cached record on error', async () => {
      const cacheKey = 'test-record';
      const cachedData = { id: '1', name: 'Cached Record' };

      // Pre-populate cache
      recordCache.set(cacheKey, cachedData);

      const operation = vi.fn(async () => {
        throw new Error('service unavailable');
      });

      const result = await executeFetchWithFallback(operation, cacheKey);

      expect(result).toEqual(cachedData);
      expect(operation).toHaveBeenCalled();
    });

    it('should throw error if no cache available for fallback', async () => {
      const cacheKey = 'no-cache';

      const operation = vi.fn(async () => {
        throw new Error('network error');
      });

      await expect(
        executeSearchWithFallback(operation, cacheKey)
      ).rejects.toThrow();
    });
  });

  describe('Error Context Creation', () => {
    it('should create comprehensive error context', () => {
      const error = new Error('test error');
      error.stack = 'test stack trace';

      const context = errorHandler.createErrorContext(error, {
        operation: 'test-op',
        userId: '123',
      });

      expect(context).toMatchObject({
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        retryable: false,
        originalError: error,
        context: {
          operation: 'test-op',
          userId: '123',
        },
        stackTrace: 'test stack trace',
      });
      expect(context.suggestion).toBeTruthy();
      expect(context.timestamp).toBeInstanceOf(Date);
    });

    it('should determine retryable errors correctly', () => {
      const networkError = new Error('network error');
      const networkContext = errorHandler.createErrorContext(networkError);
      expect(networkContext.retryable).toBe(true);

      const authError = new Error('unauthorized');
      const authContext = errorHandler.createErrorContext(authError);
      expect(authContext.retryable).toBe(false);
    });
  });

  describe('Error Statistics', () => {
    it('should track error statistics', () => {
      // Create some errors
      errorHandler.createErrorContext(new Error('network error'));
      errorHandler.createErrorContext(new Error('rate limit exceeded'));
      errorHandler.createErrorContext(new Error('unauthorized'));

      const stats = errorHandler.getErrorStats();

      expect(stats.total).toBe(3);
      expect(stats.byCategory[ErrorCategory.NETWORK]).toBe(1);
      expect(stats.byCategory[ErrorCategory.RATE_LIMIT]).toBe(1);
      expect(stats.byCategory[ErrorCategory.PERMISSION]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.MEDIUM]).toBe(2);
      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.recentErrors).toHaveLength(3);
    });

    it('should clear error log', () => {
      errorHandler.createErrorContext(new Error('test error'));
      expect(errorHandler.getErrorStats().total).toBe(1);

      errorHandler.clearErrorLog();
      expect(errorHandler.getErrorStats().total).toBe(0);
    });
  });

  describe('withErrorHandling wrapper', () => {
    it('should execute operation successfully without errors', async () => {
      const operation = vi.fn(async () => 'success');

      const result = await withErrorHandling(operation, {
        operationName: 'test-operation',
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry with cache fallback when specified', async () => {
      const cacheKey = 'test-key';
      const cachedData = { data: 'cached' };
      searchCache.set(cacheKey, cachedData);

      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('network error');
        }
        return 'success';
      });

      const result = await withErrorHandling(operation, {
        operationName: 'test-search',
        cacheKey,
        cache: 'search',
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle operations without error handling when disabled', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: false });

      const operation = vi.fn(async () => {
        throw new Error('test error');
      });

      await expect(withErrorHandling(operation)).rejects.toThrow('test error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('Backward Compatibility', () => {
    it('should not affect operations when advanced error handling is disabled', async () => {
      features.updateFlags({ enableAdvancedErrorHandling: false });

      const operation = vi.fn(async () => 'success');
      const result = await errorHandler.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should preserve original error format when enhanced', () => {
      const originalError = new Error('original message');
      originalError.stack = 'original stack';

      const context = errorHandler.createErrorContext(originalError);
      const enhancedError = (errorHandler as any).enhanceError(
        originalError,
        context
      );

      expect(enhancedError.message).toContain('original message');
      expect((enhancedError as any).originalError).toBe(originalError);
      expect((enhancedError as any).context).toBe(context);
    });
  });
});
