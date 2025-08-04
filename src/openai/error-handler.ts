/**
 * OpenAI Tools Error Handler
 * Comprehensive error handling for OpenAI-compliant tools
 */

import { OpenAIToolError } from '../types/openai-types.js';

/**
 * Error categories for OpenAI tools
 */
export enum OpenAIErrorCategory {
  VALIDATION = 'VALIDATION',
  API = 'API',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  CACHE = 'CACHE',
  TRANSFORMATION = 'TRANSFORMATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL = 'INTERNAL',
}

/**
 * Specific error types for OpenAI tools
 */
export class OpenAIValidationError extends Error {
  public readonly category = OpenAIErrorCategory.VALIDATION;
  
  constructor(message: string, public field?: string, public value?: any) {
    super(message);
    this.name = 'OpenAIValidationError';
  }
}

export class OpenAIAPIError extends Error {
  public readonly category = OpenAIErrorCategory.API;
  
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'OpenAIAPIError';
  }
}

export class OpenAINetworkError extends Error {
  public readonly category = OpenAIErrorCategory.NETWORK;
  
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'OpenAINetworkError';
  }
}

export class OpenAITimeoutError extends Error {
  public readonly category = OpenAIErrorCategory.TIMEOUT;
  
  constructor(message: string, public timeoutMs?: number) {
    super(message);
    this.name = 'OpenAITimeoutError';
  }
}

export class OpenAIRateLimitError extends Error {
  public readonly category = OpenAIErrorCategory.RATE_LIMIT;
  
  constructor(
    message: string,
    public retryAfter?: number,
    public limit?: number
  ) {
    super(message);
    this.name = 'OpenAIRateLimitError';
  }
}

export class OpenAICacheError extends Error {
  public readonly category = OpenAIErrorCategory.CACHE;
  
  constructor(message: string, public operation?: string) {
    super(message);
    this.name = 'OpenAICacheError';
  }
}

export class OpenAITransformationError extends Error {
  public readonly category = OpenAIErrorCategory.TRANSFORMATION;
  
  constructor(
    message: string,
    public data?: any,
    public objectType?: string
  ) {
    super(message);
    this.name = 'OpenAITransformationError';
  }
}

export class OpenAINotFoundError extends Error {
  public readonly category = OpenAIErrorCategory.NOT_FOUND;
  
  constructor(message: string, public id?: string, public objectType?: string) {
    super(message);
    this.name = 'OpenAINotFoundError';
  }
}

/**
 * Error handler for OpenAI tools
 */
export class OpenAIErrorHandler {
  /**
   * Convert any error to OpenAI tool error format
   */
  static toOpenAIError(error: any, context?: string): OpenAIToolError {
    const timestamp = new Date().toISOString();

    // Handle known error types
    if (error instanceof OpenAIValidationError) {
      return {
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: {
          field: error.field,
          value: error.value,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAIAPIError) {
      return {
        code: 'API_ERROR',
        message: error.message,
        details: {
          statusCode: error.statusCode,
          response: error.response,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAINetworkError) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        details: {
          originalError: error.originalError?.message,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAITimeoutError) {
      return {
        code: 'TIMEOUT_ERROR',
        message: error.message,
        details: {
          timeoutMs: error.timeoutMs,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAIRateLimitError) {
      return {
        code: 'RATE_LIMIT_ERROR',
        message: error.message,
        details: {
          retryAfter: error.retryAfter,
          limit: error.limit,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAICacheError) {
      return {
        code: 'CACHE_ERROR',
        message: error.message,
        details: {
          operation: error.operation,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAITransformationError) {
      return {
        code: 'TRANSFORMATION_ERROR',
        message: error.message,
        details: {
          objectType: error.objectType,
          context,
        },
        timestamp,
      };
    }

    if (error instanceof OpenAINotFoundError) {
      return {
        code: 'NOT_FOUND_ERROR',
        message: error.message,
        details: {
          id: error.id,
          objectType: error.objectType,
          context,
        },
        timestamp,
      };
    }

    // Handle Axios errors (from API calls)
    if (error?.response) {
      const statusCode = error.response.status;
      const responseData = error.response.data;

      let code = 'API_ERROR';
      let message = error.message;

      // Map specific HTTP status codes
      switch (statusCode) {
        case 400:
          code = 'BAD_REQUEST';
          message = 'Invalid request parameters';
          break;
        case 401:
          code = 'UNAUTHORIZED';
          message = 'Authentication required';
          break;
        case 403:
          code = 'FORBIDDEN';
          message = 'Access denied';
          break;
        case 404:
          code = 'NOT_FOUND';
          message = 'Resource not found';
          break;
        case 409:
          code = 'CONFLICT';
          message = 'Resource conflict';
          break;
        case 429:
          code = 'RATE_LIMITED';
          message = 'Too many requests';
          break;
        case 500:
          code = 'INTERNAL_SERVER_ERROR';
          message = 'Internal server error';
          break;
        case 502:
          code = 'BAD_GATEWAY';
          message = 'Bad gateway';
          break;
        case 503:
          code = 'SERVICE_UNAVAILABLE';
          message = 'Service temporarily unavailable';
          break;
        case 504:
          code = 'GATEWAY_TIMEOUT';
          message = 'Gateway timeout';
          break;
      }

      return {
        code,
        message,
        details: {
          statusCode,
          responseData,
          context,
        },
        timestamp,
      };
    }

    // Handle network errors
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
        details: {
          errorCode: error.code,
          context,
        },
        timestamp,
      };
    }

    // Handle timeout errors
    if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        message: 'Request timed out',
        details: {
          originalMessage: error.message,
          context,
        },
        timestamp,
      };
    }

    // Generic error handling
    return {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      details: {
        error: error instanceof Error ? error.stack : String(error),
        context,
      },
      timestamp,
    };
  }

  /**
   * Log error with appropriate level
   */
  static logError(error: OpenAIToolError, operation: string): void {
    const logData = {
      operation,
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp,
      },
    };

    // Determine log level based on error type
    if (this.isCriticalError(error.code)) {
      console.error('[OpenAI Error] Critical error:', logData);
    } else if (this.isWarningError(error.code)) {
      console.warn('[OpenAI Error] Warning:', logData);
    } else {
      console.log('[OpenAI Error] Info:', logData);
    }

    // Log details separately in development
    if (process.env.NODE_ENV === 'development' && error.details) {
      console.debug('[OpenAI Error] Details:', error.details);
    }
  }

  /**
   * Determine if error is retryable
   */
  static isRetryableError(error: OpenAIToolError): boolean {
    const retryableCodes = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMITED',
      'INTERNAL_SERVER_ERROR',
      'BAD_GATEWAY',
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
    ];

    return retryableCodes.includes(error.code);
  }

  /**
   * Get retry delay for retryable errors
   */
  static getRetryDelay(error: OpenAIToolError, attempt: number): number {
    // Rate limit errors might specify retry-after
    if (error.code === 'RATE_LIMITED' && error.details?.retryAfter) {
      return error.details.retryAfter * 1000;
    }

    // Exponential backoff for other retryable errors
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  /**
   * Create user-friendly error message
   */
  static getUserFriendlyMessage(error: OpenAIToolError): string {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return 'Invalid input provided. Please check your search query or parameters.';
      
      case 'NOT_FOUND':
      case 'NOT_FOUND_ERROR':
        return 'The requested resource could not be found.';
      
      case 'UNAUTHORIZED':
        return 'Authentication failed. Please check your API credentials.';
      
      case 'FORBIDDEN':
        return 'Access denied. You may not have permission to access this resource.';
      
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment before trying again.';
      
      case 'NETWORK_ERROR':
        return 'Network connection failed. Please check your internet connection.';
      
      case 'TIMEOUT_ERROR':
        return 'The request timed out. Please try again.';
      
      case 'SERVICE_UNAVAILABLE':
        return 'The service is temporarily unavailable. Please try again later.';
      
      case 'INTERNAL_SERVER_ERROR':
        return 'An internal error occurred. Please try again or contact support.';
      
      default:
        return error.message || 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Check if error code indicates a critical error
   */
  private static isCriticalError(code: string): boolean {
    const criticalCodes = [
      'INTERNAL_SERVER_ERROR',
      'UNKNOWN_ERROR',
      'API_ERROR',
    ];
    return criticalCodes.includes(code);
  }

  /**
   * Check if error code indicates a warning-level error
   */
  private static isWarningError(code: string): boolean {
    const warningCodes = [
      'VALIDATION_ERROR',
      'NOT_FOUND',
      'NOT_FOUND_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'RATE_LIMITED',
      'TIMEOUT_ERROR',
    ];
    return warningCodes.includes(code);
  }
}

/**
 * Utility function to wrap async operations with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries: number = 3
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const openaiError = OpenAIErrorHandler.toOpenAIError(error, context);
      
      OpenAIErrorHandler.logError(openaiError, context);

      // Don't retry on non-retryable errors
      if (!OpenAIErrorHandler.isRetryableError(openaiError)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying
      const delay = OpenAIErrorHandler.getRetryDelay(openaiError, attempt);
      console.log(`[OpenAI Error] Retrying ${context} in ${delay}ms (attempt ${attempt}/${maxRetries})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}