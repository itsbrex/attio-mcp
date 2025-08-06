/**
 * Security Middleware for ChatGPT Connector
 * Implements prompt injection prevention, input sanitization, and rate limiting
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Security configuration
export interface SecurityConfig {
  enablePromptInjectionDetection: boolean;
  enableInputSanitization: boolean;
  enableRateLimiting: boolean;
  maxRequestsPerMinute: number;
  maxRequestSize: number;
  blockedPatterns: RegExp[];
  allowedDomains: string[];
}

// Default security configuration
export const defaultSecurityConfig: SecurityConfig = {
  enablePromptInjectionDetection: true,
  enableInputSanitization: true,
  enableRateLimiting: true,
  maxRequestsPerMinute: 60,
  maxRequestSize: 1024 * 1024, // 1MB
  blockedPatterns: [
    // SQL injection patterns
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE)\b)/gi,
    // Command injection patterns
    /(\||;|&|`|\$\(|\))/g,
    // Path traversal patterns
    /(\.\.[\/\\])/g,
    // Script injection patterns
    /<script[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    // Prompt injection patterns
    /ignore\s+previous\s+instructions/gi,
    /disregard\s+all\s+prior/gi,
    /forget\s+everything/gi,
    /new\s+instructions:/gi,
    /system\s+prompt:/gi,
    /you\s+are\s+now/gi,
    /act\s+as\s+if/gi,
    /pretend\s+to\s+be/gi,
  ],
  allowedDomains: ['app.attio.com', 'api.attio.com', 'attio.com'],
};

// Rate limiter instance
const rateLimiter = new RateLimiterMemory({
  points: defaultSecurityConfig.maxRequestsPerMinute,
  duration: 60, // Per minute
  blockDuration: 60, // Block for 1 minute
});

// Per-user rate limiters
const userRateLimiters = new Map<string, RateLimiterMemory>();

/**
 * Detect potential prompt injection attempts
 */
function detectPromptInjection(text: string, patterns: RegExp[]): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Check against blocked patterns
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      console.warn('[Security] Potential prompt injection detected:', {
        pattern: pattern.toString(),
        text: text.substring(0, 100),
      });
      return true;
    }
  }

  // Check for suspicious character sequences
  const suspiciousPatterns = [
    // Excessive special characters
    /[^\w\s]{10,}/g,
    // Unusual Unicode characters (excluding common whitespace)
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    // Zero-width characters
    /[\u200B-\u200D\uFEFF]/g,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      console.warn('[Security] Suspicious pattern detected:', {
        pattern: pattern.toString(),
      });
      return true;
    }
  }

  return false;
}

/**
 * Sanitize input to prevent injection attacks
 */
function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // Escape HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Remove control characters (excluding common whitespace like \t, \n, \r)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit string length
    const maxLength = 10000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized;
  } else if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  } else if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitize keys as well
      const sanitizedKey = sanitizeInput(key);
      sanitized[sanitizedKey] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Validate domain against allowed list
 */
function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    return allowedDomains.some((domain) => {
      const domainLower = domain.toLowerCase();
      return hostname === domainLower || hostname.endsWith(`.${domainLower}`);
    });
  } catch {
    return false;
  }
}

/**
 * Security middleware for prompt injection detection
 */
export function promptInjectionMiddleware(
  config: SecurityConfig = defaultSecurityConfig
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enablePromptInjectionDetection) {
      return next();
    }

    try {
      // Check all string values in request
      const checkValue = (value: any): boolean => {
        if (typeof value === 'string') {
          return detectPromptInjection(value, config.blockedPatterns);
        } else if (Array.isArray(value)) {
          return value.some(checkValue);
        } else if (value && typeof value === 'object') {
          return Object.values(value).some(checkValue);
        }
        return false;
      };

      // Check body
      if (req.body && checkValue(req.body)) {
        console.error('[Security] Prompt injection attempt blocked');
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Request contains potentially malicious content',
        });
        return;
      }

      // Check query parameters
      if (req.query && checkValue(req.query)) {
        console.error('[Security] Prompt injection attempt blocked in query');
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'Request contains potentially malicious content',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[Security] Error in prompt injection middleware:', error);
      next();
    }
  };
}

/**
 * Input sanitization middleware
 */
export function inputSanitizationMiddleware(
  config: SecurityConfig = defaultSecurityConfig
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enableInputSanitization) {
      return next();
    }

    try {
      // Sanitize body
      if (req.body) {
        req.body = sanitizeInput(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeInput(req.query) as any;
      }

      // Sanitize headers (be careful not to break functionality)
      const sensitiveHeaders = ['x-api-key', 'authorization'];
      for (const [key, value] of Object.entries(req.headers)) {
        if (
          !sensitiveHeaders.includes(key.toLowerCase()) &&
          typeof value === 'string'
        ) {
          req.headers[key] = sanitizeInput(value);
        }
      }

      next();
    } catch (error) {
      console.error(
        '[Security] Error in input sanitization middleware:',
        error
      );
      next();
    }
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimitingMiddleware(
  config: SecurityConfig = defaultSecurityConfig
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!config.enableRateLimiting) {
      return next();
    }

    try {
      // Get user identifier (from OAuth token or IP)
      const userId = (req as any).oauth?.token || req.ip || 'anonymous';

      // Get or create user-specific rate limiter
      if (!userRateLimiters.has(userId)) {
        userRateLimiters.set(
          userId,
          new RateLimiterMemory({
            points: config.maxRequestsPerMinute,
            duration: 60,
            blockDuration: 60,
          })
        );
      }

      const limiter = userRateLimiters.get(userId)!;

      // Try to consume a point
      try {
        await limiter.consume(userId);
        next();
      } catch (rejRes: any) {
        // Rate limit exceeded
        const retryAfter = Math.round(rejRes.msBeforeNext / 1000) || 60;
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({
          error: 'rate_limit_exceeded',
          error_description: `Too many requests. Please retry after ${retryAfter} seconds`,
          retry_after: retryAfter,
        });
      }
    } catch (error) {
      console.error('[Security] Error in rate limiting middleware:', error);
      next();
    }
  };
}

/**
 * Request size limiting middleware
 */
export function requestSizeLimitMiddleware(
  config: SecurityConfig = defaultSecurityConfig
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > config.maxRequestSize) {
      res.status(413).json({
        error: 'payload_too_large',
        error_description: `Request size exceeds maximum allowed size of ${config.maxRequestSize} bytes`,
      });
      return;
    }

    next();
  };
}

/**
 * Domain validation middleware for URLs in requests
 */
export function domainValidationMiddleware(
  config: SecurityConfig = defaultSecurityConfig
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for URLs in request body
      const checkUrls = (value: any): boolean => {
        if (typeof value === 'string') {
          // Simple URL pattern
          const urlPattern = /https?:\/\/[^\s]+/gi;
          const matches = value.match(urlPattern);

          if (matches) {
            for (const url of matches) {
              if (!isAllowedDomain(url, config.allowedDomains)) {
                console.warn('[Security] Blocked unauthorized domain:', url);
                return false;
              }
            }
          }
        } else if (Array.isArray(value)) {
          return value.every(checkUrls);
        } else if (value && typeof value === 'object') {
          return Object.values(value).every(checkUrls);
        }
        return true;
      };

      if (req.body && !checkUrls(req.body)) {
        res.status(400).json({
          error: 'invalid_domain',
          error_description: 'Request contains URLs from unauthorized domains',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('[Security] Error in domain validation middleware:', error);
      next();
    }
  };
}

/**
 * Audit logging middleware
 */
export function auditLoggingMiddleware(): (
  req: Request,
  res: Response,
  next: NextFunction
) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;

    // Override res.send to capture response
    res.send = function (data: any): Response {
      res.send = originalSend;

      // Log audit entry
      const auditEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        query: req.query,
        user: (req as any).oauth?.token || 'anonymous',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        statusCode: res.statusCode,
        duration: Date.now() - startTime,
      };

      // Log security-relevant events
      if (res.statusCode >= 400) {
        console.log('[Audit] Security event:', auditEntry);
      }

      return res.send(data);
    };

    next();
  };
}

/**
 * Apply all security middleware to an Express app
 */
export function applySecurityMiddleware(
  app: any,
  config: SecurityConfig = defaultSecurityConfig
): void {
  // Apply middleware in order
  app.use(requestSizeLimitMiddleware(config));
  app.use(auditLoggingMiddleware());
  app.use(inputSanitizationMiddleware(config));
  app.use(promptInjectionMiddleware(config));
  app.use(domainValidationMiddleware(config));
  app.use(rateLimitingMiddleware(config));

  console.log('[Security] Security middleware initialized with config:', {
    promptInjectionDetection: config.enablePromptInjectionDetection,
    inputSanitization: config.enableInputSanitization,
    rateLimiting: config.enableRateLimiting,
    maxRequestsPerMinute: config.maxRequestsPerMinute,
  });
}
