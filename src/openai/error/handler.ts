/**
 * Unified Error Handling System
 * Consolidated error management with custom error types, structured logging,
 * retry logic, circuit breaker pattern, and error sanitization
 */

import { EventEmitter } from 'events';
import { features } from '../../config/features.js';
import { searchCache, recordCache, attributeCache, transformCache } from '../cache/index.js';
import type { ICache } from '../cache/interface.js';

/**
 * Error categorization enum
 */
export enum ErrorCategory {
  RETRYABLE = 'RETRYABLE',
  CATASTROPHIC = 'CATASTROPHIC',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  API = 'API',
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

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Base application error class
 */
export class ApplicationError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly correlationId?: string;
  public readonly retryable: boolean;
  public readonly sanitized: boolean;

  constructor(
    message: string,
    code: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    options?: {
      severity?: ErrorSeverity;
      context?: Record<string, any>;
      correlationId?: string;
      retryable?: boolean;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.severity = options?.severity || this.determineSeverity(category);
    this.context = options?.context;
    this.timestamp = new Date();
    this.correlationId = options?.correlationId || this.generateCorrelationId();
    this.retryable = options?.retryable ?? this.isRetryableCategory(category);
    this.sanitized = false;

    if (options?.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, this.constructor);
  }

  private determineSeverity(category: ErrorCategory): ErrorSeverity {
    switch (category) {
      case ErrorCategory.CATASTROPHIC:
      case ErrorCategory.CONFIGURATION:
      case ErrorCategory.PERMISSION:
        return ErrorSeverity.CRITICAL;
      case ErrorCategory.DATA_INTEGRITY:
      case ErrorCategory.API:
        return ErrorSeverity.HIGH;
      case ErrorCategory.NETWORK:
      case ErrorCategory.RATE_LIMIT:
      case ErrorCategory.TIMEOUT:
        return ErrorSeverity.MEDIUM;
      default:
        return ErrorSeverity.LOW;
    }
  }

  private isRetryableCategory(category: ErrorCategory): boolean {
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

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize error for client response
   */
  public sanitize(): ApplicationError {
    const sanitized = new ApplicationError(
      this.getPublicMessage(),
      this.code,
      this.category,
      {
        severity: this.severity,
        correlationId: this.correlationId,
        retryable: this.retryable,
      }
    );
    (sanitized as any).sanitized = true;
    return sanitized;
  }

  private getPublicMessage(): string {
    switch (this.category) {
      case ErrorCategory.PERMISSION:
        return 'Authentication or authorization error';
      case ErrorCategory.CONFIGURATION:
        return 'System configuration error';
      case ErrorCategory.DATA_INTEGRITY:
        return 'Data validation error';
      default:
        return this.message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[email]')
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ssn]')
          .replace(/\b[A-Z0-9]{20,}\b/g, '[token]');
    }
  }

  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.sanitized ? this.message : this.getPublicMessage(),
      code: this.code,
      category: this.category,
      severity: this.severity,
      correlationId: this.correlationId,
      timestamp: this.timestamp,
      retryable: this.retryable,
      ...(this.sanitized ? {} : { context: this.context }),
    };
  }
}

/**
 * Validation error class
 */
export class ValidationError extends ApplicationError {
  public readonly field?: string;
  public readonly value?: any;
  public readonly constraints?: Record<string, any>;

  constructor(
    message: string,
    field?: string,
    options?: {
      value?: any;
      constraints?: Record<string, any>;
      context?: Record<string, any>;
      correlationId?: string;
    }
  ) {
    super(message, 'VALIDATION_ERROR', ErrorCategory.VALIDATION, {
      severity: ErrorSeverity.LOW,
      context: options?.context,
      correlationId: options?.correlationId,
      retryable: false,
    });

    this.field = field;
    this.value = options?.value;
    this.constraints = options?.constraints;
  }
}

/**
 * Network error class
 */
export class NetworkError extends ApplicationError {
  public readonly statusCode?: number;
  public readonly endpoint?: string;
  public readonly method?: string;

  constructor(
    message: string,
    statusCode?: number,
    options?: {
      endpoint?: string;
      method?: string;
      context?: Record<string, any>;
      correlationId?: string;
      cause?: Error;
    }
  ) {
    super(message, 'NETWORK_ERROR', ErrorCategory.NETWORK, {
      severity: ErrorSeverity.MEDIUM,
      context: options?.context,
      correlationId: options?.correlationId,
      retryable: true,
      cause: options?.cause,
    });

    this.statusCode = statusCode;
    this.endpoint = options?.endpoint;
    this.method = options?.method;
  }
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterRange: number;
  retryableErrors?: ErrorCategory[];
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenAttempts: number;
  resetTimeout: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private halfOpenAttempts: number = 0;
  private readonly config: CircuitBreakerConfig;
  private resetTimer?: NodeJS.Timeout;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    super();
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      successThreshold: config.successThreshold || 3,
      timeout: config.timeout || 30000,
      halfOpenAttempts: config.halfOpenAttempts || 3,
      resetTimeout: config.resetTimeout || 60000,
    };
  }

  public async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else if (fallback) {
        this.emit('fallback');
        return fallback();
      } else {
        throw new ApplicationError(
          'Circuit breaker is open',
          'CIRCUIT_OPEN',
          ErrorCategory.SERVICE_UNAVAILABLE
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  private onFailure(error: any): void {
    this.lastFailureTime = new Date();
    this.failureCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionToOpen();
    }

    this.emit('failure', error);
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.timeout;
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.emit('open');
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      this.transitionToHalfOpen();
    }, this.config.resetTimeout);
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.emit('half-open');
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.emit('closed');
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }

  public getState(): CircuitState {
    return this.state;
  }

  public reset(): void {
    this.transitionToClosed();
  }
}

/**
 * Unified error handler with retry, circuit breaker, and logging
 */
export class UnifiedErrorHandler extends EventEmitter {
  private readonly defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitterRange: 0.3,
  };

  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private readonly correlationStore: Map<string, any> = new Map();
  private readonly errorLog: ApplicationError[] = [];
  private readonly maxLogSize: number = 1000;

  constructor() {
    super();
  }

  /**
   * Categorize error based on its characteristics
   */
  public categorizeError(error: Error | any): ErrorCategory {
    if (error instanceof ApplicationError) {
      return error.category;
    }

    const message = error?.message?.toLowerCase() || '';
    const code = error?.code || error?.response?.status;

    if (message.includes('timeout') || code === 'ETIMEDOUT' || code === 408) {
      return ErrorCategory.TIMEOUT;
    }

    if (message.includes('network') || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      return ErrorCategory.NETWORK;
    }

    if (code === 429 || message.includes('rate limit')) {
      return ErrorCategory.RATE_LIMIT;
    }

    if (code === 404 || message.includes('not found')) {
      return ErrorCategory.RESOURCE_NOT_FOUND;
    }

    if (code === 401 || code === 403 || message.includes('unauthorized')) {
      return ErrorCategory.PERMISSION;
    }

    if (code === 400 || code === 422 || message.includes('validation')) {
      return ErrorCategory.VALIDATION;
    }

    if (code === 503 || message.includes('service unavailable')) {
      return ErrorCategory.SERVICE_UNAVAILABLE;
    }

    if (code >= 500 && code < 600) {
      return ErrorCategory.API;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    policy: Partial<RetryPolicy> = {},
    correlationId?: string
  ): Promise<T> {
    const retryPolicy = { ...this.defaultRetryPolicy, ...policy };
    let lastError: any;
    let attempt = 0;

    while (attempt <= retryPolicy.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.wrapError(error, correlationId);
        
        if (!this.shouldRetry(lastError, retryPolicy, attempt)) {
          throw lastError;
        }

        const delay = this.calculateDelay(attempt, retryPolicy);
        
        if (features.isEnabled('enableEnhancedLogging')) {
          console.log(
            `[UnifiedErrorHandler] Retry attempt ${attempt + 1}/${retryPolicy.maxRetries} after ${delay}ms`,
            { correlationId: lastError.correlationId }
          );
        }

        await this.delay(delay);
        attempt++;
      }
    }

    throw lastError;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  public async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    breakerId: string,
    config?: Partial<CircuitBreakerConfig>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    let breaker = this.circuitBreakers.get(breakerId);
    
    if (!breaker) {
      breaker = new CircuitBreaker(config);
      this.circuitBreakers.set(breakerId, breaker);
      
      breaker.on('open', () => {
        this.emit('circuit-open', { breakerId });
      });
      
      breaker.on('closed', () => {
        this.emit('circuit-closed', { breakerId });
      });
    }

    return breaker.execute(operation, fallback);
  }

  /**
   * Execute operation with cache fallback
   */
  public async executeWithCacheFallback<T>(
    operation: () => Promise<T>,
    cacheType: 'search' | 'record' | 'attribute' | 'transform',
    cacheKey: string,
    options?: {
      correlationId?: string;
      retryPolicy?: Partial<RetryPolicy>;
      circuitBreakerId?: string;
    }
  ): Promise<T> {
    const cache = this.getCacheByType(cacheType);
    
    const fallback = async (): Promise<T> => {
      const cached = cache.get(cacheKey);
      if (cached) {
        if (features.isEnabled('enableEnhancedLogging')) {
          console.log(`[UnifiedErrorHandler] Using cached ${cacheType} data`, {
            correlationId: options?.correlationId,
          });
        }
        return cached as T;
      }
      throw new ApplicationError(
        `No cached ${cacheType} data available`,
        'CACHE_MISS',
        ErrorCategory.RESOURCE_NOT_FOUND
      );
    };

    try {
      let result: T;
      
      if (options?.circuitBreakerId) {
        result = await this.executeWithCircuitBreaker(
          () => this.executeWithRetry(operation, options?.retryPolicy, options?.correlationId),
          options.circuitBreakerId,
          undefined,
          fallback
        );
      } else {
        result = await this.executeWithRetry(operation, options?.retryPolicy, options?.correlationId);
      }

      // Cache successful result
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      // Try fallback on error
      try {
        return await fallback();
      } catch (fallbackError) {
        throw error; // Throw original error if fallback also fails
      }
    }
  }

  /**
   * Log error with structured context
   */
  public logError(error: ApplicationError): void {
    this.errorLog.push(error);
    
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    if (features.isEnabled('enableEnhancedLogging')) {
      const logLevel = this.getLogLevel(error.severity);
      const logData = {
        correlationId: error.correlationId,
        category: error.category,
        severity: error.severity,
        code: error.code,
        message: error.message,
        context: error.context,
        timestamp: error.timestamp,
      };

      console[logLevel]('[UnifiedErrorHandler]', logData);
    }

    this.emit('error-logged', error);
  }

  /**
   * Create Express error middleware
   */
  public createExpressMiddleware() {
    return (err: any, req: any, res: any, next: any) => {
      const error = this.wrapError(err, req.correlationId);
      this.logError(error);

      const statusCode = this.getHttpStatusCode(error);
      const response = error.sanitize().toJSON();

      res.status(statusCode).json({
        error: response,
        correlationId: error.correlationId,
      });
    };
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
      circuitBreakers: {},
    };

    for (const error of this.errorLog) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    stats.recentErrors = this.errorLog.slice(-10).map(e => ({
      category: e.category,
      severity: e.severity,
      timestamp: e.timestamp,
      correlationId: e.correlationId,
      message: e.sanitize().message,
    }));

    for (const [id, breaker] of this.circuitBreakers) {
      stats.circuitBreakers[id] = breaker.getState();
    }

    return stats;
  }

  /**
   * Clear error log
   */
  public clearErrorLog(): void {
    this.errorLog.length = 0;
  }

  /**
   * Reset all circuit breakers
   */
  public resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  // Private helper methods

  private wrapError(error: any, correlationId?: string): ApplicationError {
    if (error instanceof ApplicationError) {
      if (!error.correlationId && correlationId) {
        (error as any).correlationId = correlationId;
      }
      return error;
    }

    const category = this.categorizeError(error);
    return new ApplicationError(
      error?.message || 'Unknown error',
      error?.code || 'UNKNOWN_ERROR',
      category,
      {
        correlationId,
        cause: error instanceof Error ? error : undefined,
        context: error?.context,
      }
    );
  }

  private shouldRetry(error: ApplicationError, policy: RetryPolicy, attempt: number): boolean {
    if (attempt >= policy.maxRetries) {
      return false;
    }

    if (!error.retryable) {
      return false;
    }

    if (policy.retryableErrors && !policy.retryableErrors.includes(error.category)) {
      return false;
    }

    return true;
  }

  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    const baseDelay = Math.min(
      policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt),
      policy.maxDelay
    );

    // Add jitter
    const jitter = baseDelay * policy.jitterRange * (Math.random() - 0.5) * 2;
    return Math.max(0, baseDelay + jitter);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getCacheByType(type: string): ICache<string, any> {
    switch (type) {
      case 'search':
        return searchCache;
      case 'record':
        return recordCache;
      case 'attribute':
        return attributeCache;
      case 'transform':
        return transformCache;
      default:
        throw new Error(`Unknown cache type: ${type}`);
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'log';
    }
  }

  private getHttpStatusCode(error: ApplicationError): number {
    if (error instanceof NetworkError && error.statusCode) {
      return error.statusCode;
    }

    switch (error.category) {
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.PERMISSION:
        return 403;
      case ErrorCategory.RESOURCE_NOT_FOUND:
        return 404;
      case ErrorCategory.CONFLICT:
        return 409;
      case ErrorCategory.RATE_LIMIT:
        return 429;
      case ErrorCategory.SERVICE_UNAVAILABLE:
        return 503;
      case ErrorCategory.TIMEOUT:
        return 504;
      default:
        return 500;
    }
  }
}

// Export singleton instance
export const errorHandler = new UnifiedErrorHandler();

// Export convenience functions
export function withRetry<T>(
  operation: () => Promise<T>,
  policy?: Partial<RetryPolicy>
): Promise<T> {
  return errorHandler.executeWithRetry(operation, policy);
}

export function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  breakerId: string,
  config?: Partial<CircuitBreakerConfig>,
  fallback?: () => Promise<T>
): Promise<T> {
  return errorHandler.executeWithCircuitBreaker(operation, breakerId, config, fallback);
}

export function withCacheFallback<T>(
  operation: () => Promise<T>,
  cacheType: 'search' | 'record' | 'attribute' | 'transform',
  cacheKey: string,
  options?: {
    correlationId?: string;
    retryPolicy?: Partial<RetryPolicy>;
    circuitBreakerId?: string;
  }
): Promise<T> {
  return errorHandler.executeWithCacheFallback(operation, cacheType, cacheKey, options);
}