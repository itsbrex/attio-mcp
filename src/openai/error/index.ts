/**
 * Error Handling Module Exports
 * Central export point for unified error handling system
 */

// Core error classes
export {
  ApplicationError,
  ValidationError,
  NetworkError,
} from './handler.js';

// Error categorization
export {
  ErrorCategory,
  ErrorSeverity,
} from './handler.js';

// Circuit breaker
export {
  CircuitBreaker,
  CircuitState,
} from './handler.js';

// Types
export type {
  RetryPolicy,
  CircuitBreakerConfig,
} from './handler.js';

// Unified error handler
export {
  UnifiedErrorHandler,
  errorHandler,
} from './handler.js';

// Convenience functions
export {
  withRetry,
  withCircuitBreaker,
  withCacheFallback,
} from './handler.js';

// Import necessary items for the helper functions
import {
  ApplicationError,
  ValidationError,
  NetworkError,
  ErrorCategory,
  errorHandler,
} from './handler.js';

import type { RetryPolicy, CircuitBreakerConfig } from './handler.js';

/**
 * Quick error creation helpers
 */
export function createValidationError(
  message: string,
  field?: string,
  value?: any
): ValidationError {
  return new ValidationError(message, field, { value });
}

export function createNetworkError(
  message: string,
  statusCode?: number,
  endpoint?: string
): NetworkError {
  return new NetworkError(message, statusCode, { endpoint });
}

export function createApplicationError(
  message: string,
  code: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN
): ApplicationError {
  return new ApplicationError(message, code, category);
}

/**
 * Error predicates for type guards
 */
export function isApplicationError(error: any): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function isValidationError(error: any): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNetworkError(error: any): error is NetworkError {
  return error instanceof NetworkError;
}

export function isRetryableError(error: any): boolean {
  if (error instanceof ApplicationError) {
    return error.retryable;
  }
  
  const category = errorHandler.categorizeError(error);
  return [
    ErrorCategory.RETRYABLE,
    ErrorCategory.NETWORK,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.TIMEOUT,
    ErrorCategory.SERVICE_UNAVAILABLE,
    ErrorCategory.CONFLICT,
    ErrorCategory.API,
  ].includes(category);
}

/**
 * Error context helpers
 */
export function createCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function attachCorrelationId(error: any, correlationId: string): void {
  if (error instanceof ApplicationError) {
    (error as any).correlationId = correlationId;
  } else if (error && typeof error === 'object') {
    error.correlationId = correlationId;
  }
}

/**
 * Error sanitization helpers
 */
export function sanitizeError(error: any): any {
  if (error instanceof ApplicationError) {
    return error.sanitize();
  }
  
  // Basic sanitization for non-ApplicationError instances
  const message = String(error?.message || 'Unknown error')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
    .replace(/\b[A-Z0-9]{20,}\b/g, '[token]');
  
  return {
    message,
    code: error?.code || 'UNKNOWN_ERROR',
  };
}

/**
 * Global error configuration
 */
export interface ErrorConfig {
  enableLogging?: boolean;
  enableMetrics?: boolean;
  maxLogSize?: number;
  defaultRetryPolicy?: Partial<RetryPolicy>;
  defaultCircuitBreakerConfig?: Partial<CircuitBreakerConfig>;
}

let globalConfig: ErrorConfig = {
  enableLogging: true,
  enableMetrics: true,
  maxLogSize: 1000,
};

export function configureErrorHandling(config: ErrorConfig): void {
  globalConfig = { ...globalConfig, ...config };
}

export function getErrorConfig(): ErrorConfig {
  return { ...globalConfig };
}

/**
 * Error reporting helpers
 */
export function reportError(error: any, context?: Record<string, any>): void {
  const wrappedError = error instanceof ApplicationError 
    ? error 
    : new ApplicationError(
        error?.message || 'Unknown error',
        error?.code || 'UNKNOWN_ERROR',
        errorHandler.categorizeError(error),
        { context }
      );
  
  errorHandler.logError(wrappedError);
}

export function getErrorStatistics(): Record<string, any> {
  return errorHandler.getErrorStats();
}

export function clearErrorLog(): void {
  errorHandler.clearErrorLog();
}

export function resetCircuitBreakers(): void {
  errorHandler.resetCircuitBreakers();
}