/**
 * Advanced Error Handling System
 * Provides error categorization, recovery strategies, and detailed logging
 */

import { features } from '../../config/features.js';

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  API = 'API',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  RATE_LIMIT = 'RATE_LIMIT',
  DATA_INTEGRITY = 'DATA_INTEGRITY',
  CONFIGURATION = 'CONFIGURATION',
  TIMEOUT = 'TIMEOUT',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  originalError: Error;
  timestamp: Date;
  context?: Record<string, any>;
  stackTrace?: string;
  suggestion?: string;
}

export interface RecoveryStrategy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  fallbackAction?: () => Promise<any>;
}

/**
 * Advanced error handler with recovery strategies
 */
export class AdvancedErrorHandler {
  private errorLog: ErrorContext[] = [];
  private maxLogSize = 1000;
  private recoveryStrategies: Map<ErrorCategory, RecoveryStrategy>;

  constructor() {
    this.recoveryStrategies = new Map([
      [ErrorCategory.NETWORK, {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      }],
      [ErrorCategory.RATE_LIMIT, {
        maxRetries: 5,
        retryDelay: 5000,
        backoffMultiplier: 1.5,
      }],
      [ErrorCategory.API, {
        maxRetries: 2,
        retryDelay: 2000,
        backoffMultiplier: 1.5,
      }],
      [ErrorCategory.TIMEOUT, {
        maxRetries: 2,
        retryDelay: 3000,
        backoffMultiplier: 2,
      }],
      [ErrorCategory.SERVICE_UNAVAILABLE, {
        maxRetries: 4,
        retryDelay: 10000,
        backoffMultiplier: 1.5,
      }],
      [ErrorCategory.CONFLICT, {
        maxRetries: 1,
        retryDelay: 500,
        backoffMultiplier: 1,
      }],
    ]);
  }

  /**
   * Categorize error based on its characteristics
   */
  public categorizeError(error: Error | any): ErrorCategory {
    if (!features.isEnabled('enableAdvancedErrorHandling')) {
      return ErrorCategory.UNKNOWN;
    }

    const message = error?.message?.toLowerCase() || '';
    const code = error?.code || error?.response?.status;

    // Timeout errors (check first as they can overlap with network)
    if (
      message.includes('timeout') ||
      message.includes('etimedout') ||
      code === 'ETIMEDOUT' ||
      code === 408
    ) {
      return ErrorCategory.TIMEOUT;
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('econnreset') ||
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND'
    ) {
      return ErrorCategory.NETWORK;
    }

    // Rate limiting
    if (code === 429 || message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT;
    }

    // Quota exceeded
    if (code === 402 || message.includes('quota') || message.includes('limit exceeded')) {
      return ErrorCategory.QUOTA_EXCEEDED;
    }

    // Resource not found
    if (code === 404 || message.includes('not found') || message.includes('does not exist')) {
      return ErrorCategory.RESOURCE_NOT_FOUND;
    }

    // Conflict errors
    if (code === 409 || message.includes('conflict') || message.includes('already exists')) {
      return ErrorCategory.CONFLICT;
    }

    // Permission errors
    if (
      code === 401 ||
      code === 403 ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('permission denied')
    ) {
      return ErrorCategory.PERMISSION;
    }

    // Validation errors
    if (
      code === 400 ||
      code === 422 ||
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('malformed')
    ) {
      return ErrorCategory.VALIDATION;
    }

    // Service unavailable
    if (code === 503 || message.includes('service unavailable') || message.includes('maintenance')) {
      return ErrorCategory.SERVICE_UNAVAILABLE;
    }

    // API errors (generic server errors)
    if (code >= 500 && code < 600) {
      return ErrorCategory.API;
    }

    // Data integrity errors
    if (
      message.includes('integrity') ||
      message.includes('duplicate') ||
      message.includes('constraint') ||
      message.includes('foreign key')
    ) {
      return ErrorCategory.DATA_INTEGRITY;
    }

    // Configuration errors
    if (
      message.includes('config') ||
      message.includes('missing') ||
      message.includes('environment')
    ) {
      return ErrorCategory.CONFIGURATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  public determineSeverity(error: Error | any, category: ErrorCategory): ErrorSeverity {
    // Critical errors
    if (
      category === ErrorCategory.PERMISSION ||
      category === ErrorCategory.CONFIGURATION
    ) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity
    if (
      category === ErrorCategory.DATA_INTEGRITY ||
      category === ErrorCategory.API
    ) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity
    if (
      category === ErrorCategory.NETWORK ||
      category === ErrorCategory.RATE_LIMIT
    ) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity
    return ErrorSeverity.LOW;
  }

  /**
   * Create error context with full details
   */
  public createErrorContext(
    error: Error | any,
    additionalContext?: Record<string, any>
  ): ErrorContext {
    const category = this.categorizeError(error);
    const severity = this.determineSeverity(error, category);

    const context: ErrorContext = {
      category,
      severity,
      retryable: this.isRetryable(category),
      originalError: error,
      timestamp: new Date(),
      context: additionalContext,
      stackTrace: error?.stack,
      suggestion: this.getSuggestion(category, error),
    };

    // Log error if advanced error handling is enabled
    if (features.isEnabled('enableAdvancedErrorHandling')) {
      this.logError(context);
    }

    return context;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(category: ErrorCategory): boolean {
    return [
      ErrorCategory.NETWORK,
      ErrorCategory.RATE_LIMIT,
      ErrorCategory.API,
      ErrorCategory.TIMEOUT,
      ErrorCategory.SERVICE_UNAVAILABLE,
      ErrorCategory.CONFLICT,
    ].includes(category);
  }

  /**
   * Get suggestion for error resolution
   */
  private getSuggestion(category: ErrorCategory, error: any): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Check network connectivity and retry the operation';
      case ErrorCategory.RATE_LIMIT:
        return 'Wait before retrying or reduce request frequency';
      case ErrorCategory.PERMISSION:
        return 'Verify API credentials and permissions';
      case ErrorCategory.VALIDATION:
        return 'Check input data format and required fields';
      case ErrorCategory.API:
        return 'API server error, retry later or contact support';
      case ErrorCategory.DATA_INTEGRITY:
        return 'Check for duplicate data or constraint violations';
      case ErrorCategory.CONFIGURATION:
        return 'Verify configuration settings and environment variables';
      case ErrorCategory.TIMEOUT:
        return 'Operation timed out, check network speed or increase timeout settings';
      case ErrorCategory.RESOURCE_NOT_FOUND:
        return 'The requested resource does not exist, verify the ID or path';
      case ErrorCategory.CONFLICT:
        return 'Resource conflict detected, check for duplicate operations';
      case ErrorCategory.QUOTA_EXCEEDED:
        return 'API quota exceeded, upgrade plan or wait for quota reset';
      case ErrorCategory.SERVICE_UNAVAILABLE:
        return 'Service temporarily unavailable, retry after some time';
      default:
        return 'An unexpected error occurred, check logs for details';
    }
  }

  /**
   * Execute operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    if (!features.isEnabled('enableAdvancedErrorHandling')) {
      return operation();
    }

    let lastError: any;
    let retryCount = 0;
    const maxAttempts = 10; // Safety limit to prevent infinite loops

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const errorContext = this.createErrorContext(error, context);

        if (!errorContext.retryable || retryCount >= maxAttempts) {
          throw this.enhanceError(error, errorContext);
        }

        const strategy = this.recoveryStrategies.get(errorContext.category);
        if (!strategy || retryCount >= strategy.maxRetries) {
          if (strategy?.fallbackAction) {
            return await strategy.fallbackAction();
          }
          throw this.enhanceError(error, errorContext);
        }

        // Calculate delay with exponential backoff
        const delay = strategy.retryDelay * Math.pow(strategy.backoffMultiplier, retryCount);
        
        if (features.isEnabled('enableEnhancedLogging')) {
          console.log(
            `[AdvancedErrorHandler] Retrying operation (attempt ${retryCount + 1}/${strategy.maxRetries}) after ${delay}ms`
          );
        }

        await this.delay(delay);
        retryCount++;
      }
    }
  }

  /**
   * Enhance error with context information
   */
  private enhanceError(error: Error | any, context: ErrorContext): Error {
    const enhancedError = new Error(
      `[${context.category}] ${error.message || 'Unknown error'}`
    );
    
    (enhancedError as any).context = context;
    (enhancedError as any).originalError = error;
    
    return enhancedError;
  }

  /**
   * Log error to internal log
   */
  private logError(context: ErrorContext): void {
    this.errorLog.push(context);
    
    // Maintain max log size
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    if (features.isEnabled('enableEnhancedLogging')) {
      console.error('[AdvancedErrorHandler] Error logged:', {
        category: context.category,
        severity: context.severity,
        message: context.originalError?.message,
        suggestion: context.suggestion,
      });
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats(): Record<string, any> {
    const stats: Record<string, any> = {
      total: this.errorLog.length,
      byCategory: {},
      bySeverity: {},
      recentErrors: [],
    };

    for (const error of this.errorLog) {
      // Count by category
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      
      // Count by severity
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    // Get recent errors
    stats.recentErrors = this.errorLog
      .slice(-10)
      .map(e => ({
        category: e.category,
        severity: e.severity,
        timestamp: e.timestamp,
        message: e.originalError?.message,
      }));

    return stats;
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Set fallback action for a specific error category
   */
  public setFallbackAction(category: ErrorCategory, fallback: () => Promise<any>): void {
    const strategy = this.recoveryStrategies.get(category);
    if (strategy) {
      strategy.fallbackAction = fallback;
    } else {
      this.recoveryStrategies.set(category, {
        maxRetries: 1,
        retryDelay: 1000,
        backoffMultiplier: 1,
        fallbackAction: fallback,
      });
    }
  }

  /**
   * Execute operation with custom recovery options
   */
  public async executeWithCustomRecovery<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      backoffMultiplier?: number;
      fallbackAction?: () => Promise<T>;
      context?: Record<string, any>;
    } = {}
  ): Promise<T> {
    if (!features.isEnabled('enableAdvancedErrorHandling')) {
      return operation();
    }

    let lastError: any;
    let retryCount = 0;
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    const backoffMultiplier = options.backoffMultiplier || 2;

    while (retryCount <= maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const errorContext = this.createErrorContext(error, options.context);

        if (!errorContext.retryable || retryCount >= maxRetries) {
          if (options.fallbackAction) {
            try {
              return await options.fallbackAction();
            } catch (fallbackError) {
              throw this.enhanceError(error, errorContext);
            }
          }
          throw this.enhanceError(error, errorContext);
        }

        // Calculate delay with exponential backoff
        const delay = retryDelay * Math.pow(backoffMultiplier, retryCount);
        
        if (features.isEnabled('enableEnhancedLogging')) {
          console.log(
            `[AdvancedErrorHandler] Custom retry (attempt ${retryCount + 1}/${maxRetries}) after ${delay}ms`
          );
        }

        await this.delay(delay);
        retryCount++;
      }
    }

    throw lastError;
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const advancedErrorHandler = new AdvancedErrorHandler();