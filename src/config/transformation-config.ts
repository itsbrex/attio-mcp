/**
 * Transformation Configuration Module
 * Manages data transformation pipelines and settings
 */

import {
  TransformationPipeline,
  ValidationRule,
  dataTransformer,
} from '../openai/advanced/data-transformer.js';
import { features } from './features.js';

/**
 * Default transformation pipelines
 */
export const defaultPipelines: Record<string, TransformationPipeline> = {
  // OpenAI search result transformation
  openaiSearch: {
    name: 'openaiSearch',
    rules: [
      { field: 'title', type: 'format', config: { format: 'trim' } },
      {
        field: 'text',
        type: 'sanitize',
        config: { removeHtml: true, trimWhitespace: true },
      },
      { field: 'url', type: 'validate', config: { type: 'url' } },
      { field: 'metadata', type: 'enrich', config: { addMetadata: true } },
    ],
    errorHandling: 'skip',
    validation: true,
  },

  // OpenAI fetch result transformation
  openaiMetch: {
    name: 'openaiFetch',
    rules: [
      { field: 'title', type: 'format', config: { format: 'trim' } },
      {
        field: 'content',
        type: 'sanitize',
        config: { removeHtml: true, removeScripts: true },
      },
      {
        field: 'metadata.timestamp',
        type: 'convert',
        config: { targetType: 'date' },
      },
      {
        field: 'sensitive_data',
        type: 'mask',
        config: { type: 'generic', showFirst: 3, showLast: 3 },
      },
    ],
    errorHandling: 'default',
    validation: false,
  },

  // Company data transformation
  companyTransform: {
    name: 'companyTransform',
    rules: [
      { field: 'name', type: 'format', config: { format: 'trim' } },
      { field: 'domain', type: 'format', config: { format: 'lowercase' } },
      { field: 'website', type: 'validate', config: { type: 'url' } },
      {
        field: 'employee_count',
        type: 'convert',
        config: { targetType: 'number' },
      },
      {
        field: 'founded_date',
        type: 'convert',
        config: { targetType: 'date' },
      },
      { field: 'description', type: 'sanitize', config: { removeHtml: true } },
      { field: 'revenue', type: 'format', config: { format: 'currency' } },
    ],
    errorHandling: 'skip',
    validation: true,
  },

  // Person data transformation
  personTransform: {
    name: 'personTransform',
    rules: [
      { field: 'first_name', type: 'format', config: { format: 'capitalize' } },
      { field: 'last_name', type: 'format', config: { format: 'capitalize' } },
      { field: 'email', type: 'format', config: { format: 'lowercase' } },
      { field: 'email', type: 'validate', config: { type: 'email' } },
      { field: 'phone', type: 'format', config: { format: 'phone' } },
      { field: 'ssn', type: 'mask', config: { type: 'ssn' } },
      {
        field: 'bio',
        type: 'sanitize',
        config: { removeHtml: true, trimWhitespace: true },
      },
    ],
    errorHandling: 'skip',
    validation: true,
  },

  // Task data transformation
  taskTransform: {
    name: 'taskTransform',
    rules: [
      { field: 'title', type: 'format', config: { format: 'trim' } },
      { field: 'description', type: 'sanitize', config: { removeHtml: true } },
      { field: 'due_date', type: 'convert', config: { targetType: 'date' } },
      {
        field: 'priority',
        type: 'validate',
        config: { enum: ['low', 'medium', 'high', 'urgent'] },
      },
      {
        field: 'status',
        type: 'validate',
        config: { enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
      },
      { field: 'assigned_to', type: 'validate', config: { type: 'email' } },
    ],
    errorHandling: 'default',
    validation: true,
  },

  // List data transformation
  listTransform: {
    name: 'listTransform',
    rules: [
      { field: 'name', type: 'format', config: { format: 'trim' } },
      { field: 'description', type: 'sanitize', config: { removeHtml: true } },
      { field: 'created_at', type: 'convert', config: { targetType: 'date' } },
      { field: 'updated_at', type: 'convert', config: { targetType: 'date' } },
      {
        field: 'item_count',
        type: 'convert',
        config: { targetType: 'number' },
      },
    ],
    errorHandling: 'skip',
    validation: false,
  },

  // Sensitive data masking pipeline
  sensitiveDataMask: {
    name: 'sensitiveDataMask',
    rules: [
      { field: 'email', type: 'mask', config: { type: 'email' } },
      { field: 'phone', type: 'mask', config: { type: 'phone' } },
      { field: 'ssn', type: 'mask', config: { type: 'ssn' } },
      { field: 'credit_card', type: 'mask', config: { type: 'credit-card' } },
      {
        field: 'api_key',
        type: 'mask',
        config: { maskChar: 'X', showFirst: 4, showLast: 4 },
      },
      {
        field: 'password',
        type: 'mask',
        config: { maskChar: '*', showFirst: 0, showLast: 0 },
      },
    ],
    errorHandling: 'skip',
    validation: false,
  },

  // Data sanitization pipeline
  dataSanitization: {
    name: 'dataSanitization',
    rules: [
      {
        field: 'user_input',
        type: 'sanitize',
        config: { removeHtml: true, removeScripts: true, escapeSql: true },
      },
      {
        field: 'comment',
        type: 'sanitize',
        config: { removeSpecialChars: true, trimWhitespace: true },
      },
      {
        field: 'description',
        type: 'sanitize',
        config: { removeHtml: true, trimWhitespace: true },
      },
      {
        field: 'notes',
        type: 'sanitize',
        config: { removeScripts: true, trimWhitespace: true },
      },
    ],
    errorHandling: 'default',
    validation: false,
  },
};

/**
 * Default validation rules
 */
export const defaultValidationRules: Record<string, ValidationRule[]> = {
  company: [
    { field: 'name', required: true, type: 'string' },
    { field: 'domain', type: 'string', pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/i },
    { field: 'website', type: 'url' },
    { field: 'employee_count', type: 'number', min: 0 },
    { field: 'revenue', type: 'number', min: 0 },
  ],

  person: [
    { field: 'first_name', required: true, type: 'string' },
    { field: 'last_name', required: true, type: 'string' },
    { field: 'email', required: true, type: 'email' },
    { field: 'phone', type: 'string', pattern: /^[\d\s()+-]+$/ },
    { field: 'age', type: 'number', min: 0, max: 150 },
  ],

  task: [
    { field: 'title', required: true, type: 'string' },
    { field: 'due_date', type: 'date' },
    { field: 'priority', enum: ['low', 'medium', 'high', 'urgent'] },
    {
      field: 'status',
      required: true,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    },
    { field: 'completion_percentage', type: 'number', min: 0, max: 100 },
  ],

  list: [
    { field: 'name', required: true, type: 'string' },
    { field: 'item_count', type: 'number', min: 0 },
    { field: 'is_public', type: 'boolean' },
  ],

  openaiResult: [
    { field: 'id', required: true, type: 'string' },
    { field: 'title', required: true, type: 'string' },
    { field: 'url', type: 'url' },
    { field: 'score', type: 'number', min: 0, max: 1 },
  ],
};

/**
 * Transformation configuration manager
 */
export class TransformationConfigManager {
  private static instance: TransformationConfigManager;
  private customPipelines: Map<string, TransformationPipeline> = new Map();
  private customValidators: Map<string, ValidationRule[]> = new Map();

  private constructor() {
    this.initializeDefaults();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): TransformationConfigManager {
    if (!TransformationConfigManager.instance) {
      TransformationConfigManager.instance = new TransformationConfigManager();
    }
    return TransformationConfigManager.instance;
  }

  /**
   * Initialize default pipelines and validators
   */
  private initializeDefaults(): void {
    if (!features.isEnabled('enableDataTransformation')) {
      return;
    }

    // Register default pipelines
    for (const pipeline of Object.values(defaultPipelines)) {
      dataTransformer.registerPipeline(pipeline);
    }

    // Register default validation rules
    for (const [context, rules] of Object.entries(defaultValidationRules)) {
      dataTransformer.registerValidationRules(context, rules);
    }

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(
        '[TransformationConfig] Initialized default pipelines and validators'
      );
    }
  }

  /**
   * Register a custom transformation pipeline
   */
  public registerPipeline(pipeline: TransformationPipeline): void {
    this.customPipelines.set(pipeline.name, pipeline);
    dataTransformer.registerPipeline(pipeline);

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(
        `[TransformationConfig] Registered custom pipeline: ${pipeline.name}`
      );
    }
  }

  /**
   * Register custom validation rules
   */
  public registerValidationRules(
    context: string,
    rules: ValidationRule[]
  ): void {
    this.customValidators.set(context, rules);
    dataTransformer.registerValidationRules(context, rules);

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(
        `[TransformationConfig] Registered custom validation rules for: ${context}`
      );
    }
  }

  /**
   * Get all registered pipelines
   */
  public getPipelines(): string[] {
    return [
      ...Object.keys(defaultPipelines),
      ...Array.from(this.customPipelines.keys()),
    ];
  }

  /**
   * Get all validation contexts
   */
  public getValidationContexts(): string[] {
    return [
      ...Object.keys(defaultValidationRules),
      ...Array.from(this.customValidators.keys()),
    ];
  }

  /**
   * Create a custom pipeline from configuration
   */
  public createPipelineFromConfig(config: any): TransformationPipeline {
    const pipeline: TransformationPipeline = {
      name: config.name || 'custom',
      rules: [],
      errorHandling: config.errorHandling || 'skip',
      validation: config.validation || false,
    };

    // Parse rules from configuration
    if (config.rules && Array.isArray(config.rules)) {
      for (const rule of config.rules) {
        if (rule.field && rule.type) {
          pipeline.rules.push({
            field: rule.field,
            type: rule.type,
            config: rule.config || {},
          });
        }
      }
    }

    return pipeline;
  }

  /**
   * Load configuration from environment
   */
  public loadFromEnvironment(): void {
    // Load custom pipeline from environment
    const pipelineConfig = process.env.ATTIO_TRANSFORM_PIPELINE;
    if (pipelineConfig) {
      try {
        const config = JSON.parse(pipelineConfig);
        const pipeline = this.createPipelineFromConfig(config);
        this.registerPipeline(pipeline);
      } catch (error) {
        console.error(
          '[TransformationConfig] Failed to load pipeline from environment:',
          error
        );
      }
    }

    // Load custom validation rules from environment
    const validationConfig = process.env.ATTIO_VALIDATION_RULES;
    if (validationConfig) {
      try {
        const rules = JSON.parse(validationConfig);
        for (const [context, contextRules] of Object.entries(rules)) {
          if (Array.isArray(contextRules)) {
            this.registerValidationRules(
              context,
              contextRules as ValidationRule[]
            );
          }
        }
      } catch (error) {
        console.error(
          '[TransformationConfig] Failed to load validation rules from environment:',
          error
        );
      }
    }
  }

  /**
   * Reset to default configuration
   */
  public reset(): void {
    this.customPipelines.clear();
    this.customValidators.clear();
    dataTransformer.clearCache();
    this.initializeDefaults();
  }
}

// Export singleton instance
export const transformationConfig = TransformationConfigManager.getInstance();
