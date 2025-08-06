/**
 * Advanced Data Transformation System
 * Provides powerful data manipulation, validation, and transformation capabilities
 */

import { features } from '../../config/features.js';
import { advancedErrorHandler, ErrorCategory } from './error-handler.js';

export interface TransformationRule {
  field: string;
  type:
    | 'rename'
    | 'format'
    | 'convert'
    | 'validate'
    | 'sanitize'
    | 'enrich'
    | 'mask';
  config?: any;
}

export interface TransformationPipeline {
  name: string;
  rules: TransformationRule[];
  errorHandling?: 'skip' | 'throw' | 'default';
  validation?: boolean;
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?:
    | 'string'
    | 'number'
    | 'boolean'
    | 'object'
    | 'array'
    | 'date'
    | 'email'
    | 'url';
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: any[];
  custom?: (value: any) => boolean;
}

/**
 * Advanced data transformer with pipeline support
 */
export class AdvancedDataTransformer {
  private pipelines: Map<string, TransformationPipeline> = new Map();
  private validators: Map<string, ValidationRule[]> = new Map();
  private transformCache: Map<string, any> = new Map();
  private maxCacheSize = 1000;

  /**
   * Register a transformation pipeline
   */
  public registerPipeline(pipeline: TransformationPipeline): void {
    this.pipelines.set(pipeline.name, pipeline);

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(`[DataTransformer] Registered pipeline: ${pipeline.name}`);
    }
  }

  /**
   * Transform data using a named pipeline
   */
  public async transform(
    data: any,
    pipelineName: string,
    options?: {
      cache?: boolean;
      validate?: boolean;
      errorHandling?: 'skip' | 'throw' | 'default';
    }
  ): Promise<any> {
    if (!features.isEnabled('enableDataTransformation')) {
      return data; // Return unchanged if feature is disabled
    }

    const pipeline = this.pipelines.get(pipelineName);
    if (!pipeline) {
      throw new Error(`Pipeline '${pipelineName}' not found`);
    }

    // Check cache
    const cacheKey = this.generateCacheKey(data, pipelineName);
    if (options?.cache && this.transformCache.has(cacheKey)) {
      return this.transformCache.get(cacheKey);
    }

    try {
      let result = this.deepClone(data);

      // Apply transformation rules
      for (const rule of pipeline.rules) {
        result = await this.applyRule(
          result,
          rule,
          options?.errorHandling || pipeline.errorHandling
        );
      }

      // Validate if requested
      if (options?.validate || pipeline.validation) {
        const validationResult = this.validate(result, pipelineName);
        if (!validationResult.valid) {
          throw new Error(
            `Validation failed: ${validationResult.errors.join(', ')}`
          );
        }
      }

      // Cache result
      if (options?.cache) {
        this.addToCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      if (features.isEnabled('enableAdvancedErrorHandling')) {
        const errorContext = advancedErrorHandler.createErrorContext(error, {
          pipeline: pipelineName,
          data,
        });

        if (errorContext.category === ErrorCategory.VALIDATION) {
          throw error; // Re-throw validation errors
        }

        // Return original data on other errors
        return data;
      }
      throw error;
    }
  }

  /**
   * Apply a single transformation rule
   */
  private async applyRule(
    data: any,
    rule: TransformationRule,
    errorHandling: 'skip' | 'throw' | 'default' = 'throw'
  ): Promise<any> {
    try {
      switch (rule.type) {
        case 'rename':
          return this.renameField(data, rule.field, rule.config?.newName);

        case 'format':
          return this.formatField(data, rule.field, rule.config?.format);

        case 'convert':
          return this.convertField(data, rule.field, rule.config?.targetType);

        case 'validate':
          return this.validateField(data, rule.field, rule.config);

        case 'sanitize':
          return this.sanitizeField(data, rule.field, rule.config);

        case 'enrich':
          return this.enrichField(data, rule.field, rule.config);

        case 'mask':
          return this.maskField(data, rule.field, rule.config);

        default:
          throw new Error(`Unknown transformation type: ${rule.type}`);
      }
    } catch (error) {
      if (errorHandling === 'skip') {
        return data; // Skip failed transformation
      } else if (errorHandling === 'default') {
        return this.applyDefaultValue(data, rule.field, rule.config?.default);
      } else {
        throw error;
      }
    }
  }

  /**
   * Rename a field
   */
  private renameField(data: any, oldName: string, newName: string): any {
    if (!newName) return data;

    const value = this.getNestedValue(data, oldName);
    if (value !== undefined) {
      this.deleteNestedValue(data, oldName);
      this.setNestedValue(data, newName, value);
    }

    return data;
  }

  /**
   * Format a field value
   */
  private formatField(data: any, field: string, format: string): any {
    const value = this.getNestedValue(data, field);
    if (value === undefined) return data;

    let formatted: any;
    switch (format) {
      case 'uppercase':
        formatted = String(value).toUpperCase();
        break;
      case 'lowercase':
        formatted = String(value).toLowerCase();
        break;
      case 'capitalize':
        formatted = this.capitalize(String(value));
        break;
      case 'trim':
        formatted = String(value).trim();
        break;
      case 'date':
        formatted = this.formatDate(value);
        break;
      case 'currency':
        formatted = this.formatCurrency(value);
        break;
      case 'phone':
        formatted = this.formatPhone(value);
        break;
      default:
        formatted = value;
    }

    this.setNestedValue(data, field, formatted);
    return data;
  }

  /**
   * Convert field to different type
   */
  private convertField(data: any, field: string, targetType: string): any {
    const value = this.getNestedValue(data, field);
    if (value === undefined) return data;

    let converted: any;
    switch (targetType) {
      case 'string':
        converted = String(value);
        break;
      case 'number':
        converted = Number(value);
        if (isNaN(converted)) {
          throw new Error(`Cannot convert '${value}' to number`);
        }
        break;
      case 'boolean':
        converted = Boolean(value);
        break;
      case 'date':
        converted = new Date(value);
        if (isNaN(converted.getTime())) {
          throw new Error(`Cannot convert '${value}' to date`);
        }
        break;
      case 'array':
        converted = Array.isArray(value) ? value : [value];
        break;
      case 'json':
        converted = typeof value === 'string' ? JSON.parse(value) : value;
        break;
      default:
        converted = value;
    }

    this.setNestedValue(data, field, converted);
    return data;
  }

  /**
   * Validate a field
   */
  private validateField(data: any, field: string, rules: ValidationRule): any {
    const value = this.getNestedValue(data, field);

    if (
      rules.required &&
      (value === undefined || value === null || value === '')
    ) {
      throw new Error(`Field '${field}' is required`);
    }

    if (value !== undefined && value !== null) {
      if (rules.type && !this.checkType(value, rules.type)) {
        throw new Error(`Field '${field}' must be of type ${rules.type}`);
      }

      if (rules.pattern && !rules.pattern.test(String(value))) {
        throw new Error(`Field '${field}' does not match required pattern`);
      }

      if (rules.min !== undefined && value < rules.min) {
        throw new Error(`Field '${field}' must be at least ${rules.min}`);
      }

      if (rules.max !== undefined && value > rules.max) {
        throw new Error(`Field '${field}' must be at most ${rules.max}`);
      }

      if (rules.enum && !rules.enum.includes(value)) {
        throw new Error(
          `Field '${field}' must be one of: ${rules.enum.join(', ')}`
        );
      }

      if (rules.custom && !rules.custom(value)) {
        throw new Error(`Field '${field}' failed custom validation`);
      }
    }

    return data;
  }

  /**
   * Sanitize a field
   */
  private sanitizeField(data: any, field: string, config: any): any {
    const value = this.getNestedValue(data, field);
    if (value === undefined || value === null) return data;

    let sanitized = String(value);

    // Remove HTML tags
    if (config?.removeHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }

    // Remove special characters
    if (config?.removeSpecialChars) {
      sanitized = sanitized.replace(/[^\w\s]/gi, '');
    }

    // Remove extra whitespace
    if (config?.trimWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ').trim();
    }

    // Escape SQL injection characters
    if (config?.escapeSql) {
      sanitized = sanitized.replace(/['";\\]/g, '\\$&');
    }

    // Remove script tags specifically
    if (config?.removeScripts) {
      sanitized = sanitized.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        ''
      );
    }

    this.setNestedValue(data, field, sanitized);
    return data;
  }

  /**
   * Enrich a field with additional data
   */
  private async enrichField(
    data: any,
    field: string,
    config: any
  ): Promise<any> {
    const value = this.getNestedValue(data, field);
    if (value === undefined) return data;

    let enriched = value;

    // Add metadata
    if (config?.addMetadata) {
      enriched = {
        value,
        timestamp: new Date().toISOString(),
        source: config.source || 'transformation',
        ...config.metadata,
      };
    }

    // Lookup enrichment
    if (config?.lookup) {
      const lookupValue = config.lookup[value];
      if (lookupValue !== undefined) {
        enriched = lookupValue;
      }
    }

    // Function enrichment
    if (config?.enrichFunction && typeof config.enrichFunction === 'function') {
      enriched = await config.enrichFunction(value, data);
    }

    this.setNestedValue(data, field, enriched);
    return data;
  }

  /**
   * Mask sensitive data in a field
   */
  private maskField(data: any, field: string, config: any): any {
    const value = this.getNestedValue(data, field);
    if (value === undefined || value === null) return data;

    const stringValue = String(value);
    let masked: string;

    const maskChar = config?.maskChar || '*';
    const showFirst = config?.showFirst || 0;
    const showLast = config?.showLast || 0;

    if (config?.type === 'email') {
      // Mask email: show first 2 chars and domain
      const [localPart, domain] = stringValue.split('@');
      if (localPart && domain) {
        const maskedLocal =
          localPart.substring(0, 2) +
          maskChar.repeat(Math.max(0, localPart.length - 2));
        masked = `${maskedLocal}@${domain}`;
      } else {
        masked = maskChar.repeat(stringValue.length);
      }
    } else if (config?.type === 'phone') {
      // Mask phone: show last 4 digits
      masked =
        maskChar.repeat(Math.max(0, stringValue.length - 4)) +
        stringValue.slice(-4);
    } else if (config?.type === 'ssn') {
      // Mask SSN: show last 4 digits
      const digits = stringValue.replace(/\D/g, '');
      masked =
        maskChar.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
    } else if (config?.type === 'credit-card') {
      // Mask credit card: show last 4 digits
      const digits = stringValue.replace(/\D/g, '');
      masked =
        maskChar.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
    } else {
      // Generic masking
      const start = stringValue.substring(0, showFirst);
      const end = stringValue.substring(
        Math.max(showFirst, stringValue.length - showLast)
      );
      const middle = maskChar.repeat(
        Math.max(0, stringValue.length - showFirst - showLast)
      );
      masked = start + middle + end;
    }

    this.setNestedValue(data, field, masked);
    return data;
  }

  /**
   * Validate data against registered rules
   */
  public validate(
    data: any,
    context: string
  ): { valid: boolean; errors: string[] } {
    const rules = this.validators.get(context);
    if (!rules) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    for (const rule of rules) {
      try {
        this.validateField(data, rule.field, rule);
      } catch (error: any) {
        errors.push(error.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Register validation rules
   */
  public registerValidationRules(
    context: string,
    rules: ValidationRule[]
  ): void {
    this.validators.set(context, rules);
  }

  /**
   * Helper methods
   */

  private deepClone(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const lastPart = parts.pop();

    let current = obj;
    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    if (lastPart) {
      current[lastPart] = value;
    }
  }

  private deleteNestedValue(obj: any, path: string): void {
    const parts = path.split('.');
    const lastPart = parts.pop();

    let current = obj;
    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        return;
      }
      current = current[part];
    }

    if (lastPart) {
      delete current[lastPart];
    }
  }

  private applyDefaultValue(data: any, field: string, defaultValue: any): any {
    const value = this.getNestedValue(data, field);
    if (value === undefined || value === null) {
      this.setNestedValue(data, field, defaultValue);
    }
    return data;
  }

  private checkType(value: any, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      case 'array':
        return Array.isArray(value);
      case 'date':
        return value instanceof Date || !isNaN(Date.parse(value));
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
      case 'url':
        try {
          new URL(String(value));
          return true;
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private formatDate(value: any): string {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return String(value);
    }
    return date.toISOString();
  }

  private formatCurrency(value: any): string {
    const num = Number(value);
    if (isNaN(num)) {
      return String(value);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(num);
  }

  private formatPhone(value: any): string {
    const digits = String(value).replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return String(value);
  }

  private generateCacheKey(data: any, pipeline: string): string {
    const dataStr = JSON.stringify(data);
    return `${pipeline}:${this.hash(dataStr)}`;
  }

  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  private addToCache(key: string, value: any): void {
    // Maintain cache size limit
    if (this.transformCache.size >= this.maxCacheSize) {
      const firstKey = this.transformCache.keys().next().value;
      if (firstKey !== undefined) {
        this.transformCache.delete(firstKey);
      }
    }
    this.transformCache.set(key, value);
  }

  /**
   * Clear transformation cache
   */
  public clearCache(): void {
    this.transformCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.transformCache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// Export singleton instance
export const dataTransformer = new AdvancedDataTransformer();
