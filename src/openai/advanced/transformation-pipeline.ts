/**
 * Transformation Pipeline System
 * Manages complex multi-stage data transformation workflows
 */

import { dataTransformer, TransformationPipeline } from './data-transformer.js';
import { features } from '../../config/features.js';
import { advancedErrorHandler } from './error-handler.js';
import { searchCache } from './cache.js';

export interface PipelineStage {
  name: string;
  pipeline: string | TransformationPipeline;
  condition?: (data: any) => boolean;
  parallel?: boolean;
  required?: boolean;
  timeout?: number;
}

export interface PipelineWorkflow {
  name: string;
  stages: PipelineStage[];
  errorStrategy?: 'fail-fast' | 'continue' | 'rollback';
  cacheResults?: boolean;
  validateFinal?: boolean;
}

/**
 * Advanced transformation pipeline manager
 */
export class TransformationPipelineManager {
  private workflows: Map<string, PipelineWorkflow> = new Map();
  private stageResults: Map<string, any> = new Map();
  private rollbackStack: Array<{ stage: string; originalData: any }> = [];

  /**
   * Register a transformation workflow
   */
  public registerWorkflow(workflow: PipelineWorkflow): void {
    this.workflows.set(workflow.name, workflow);

    if (features.isEnabled('enableEnhancedLogging')) {
      console.log(`[PipelineManager] Registered workflow: ${workflow.name}`);
    }
  }

  /**
   * Execute a transformation workflow
   */
  public async executeWorkflow(
    data: any,
    workflowName: string,
    context?: Record<string, any>
  ): Promise<any> {
    if (!features.isEnabled('enableDataTransformation')) {
      return data;
    }

    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }

    // Check cache
    const cacheKey = this.generateCacheKey(data, workflowName);
    if (workflow.cacheResults && searchCache.has(cacheKey)) {
      return searchCache.get(cacheKey);
    }

    this.stageResults.clear();
    this.rollbackStack = [];

    let result = data;
    const startTime = Date.now();

    try {
      // Execute stages
      for (const stage of workflow.stages) {
        // Check condition
        if (stage.condition && !stage.condition(result)) {
          if (features.isEnabled('enableEnhancedLogging')) {
            console.log(
              `[PipelineManager] Skipping stage ${stage.name} - condition not met`
            );
          }
          continue;
        }

        // Execute stage with timeout
        result = await this.executeStage(
          result,
          stage,
          workflow.errorStrategy || 'fail-fast'
        );

        // Store result for potential rollback
        this.rollbackStack.push({
          stage: stage.name,
          originalData: this.deepClone(data),
        });
      }

      // Validate final result if requested
      if (workflow.validateFinal) {
        const validation = dataTransformer.validate(result, workflowName);
        if (!validation.valid) {
          throw new Error(
            `Final validation failed: ${validation.errors.join(', ')}`
          );
        }
      }

      // Cache result
      if (workflow.cacheResults) {
        searchCache.set(cacheKey, result);
      }

      const duration = Date.now() - startTime;
      if (features.isEnabled('enableEnhancedLogging')) {
        console.log(
          `[PipelineManager] Workflow ${workflowName} completed in ${duration}ms`
        );
      }

      return result;
    } catch (error) {
      // Handle error based on strategy
      if (workflow.errorStrategy === 'rollback') {
        return this.rollback(data);
      } else if (workflow.errorStrategy === 'continue') {
        return result; // Return partial result
      } else {
        throw error; // Fail fast
      }
    }
  }

  /**
   * Execute a single pipeline stage
   */
  private async executeStage(
    data: any,
    stage: PipelineStage,
    errorStrategy: string
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Set timeout if specified
      const timeoutPromise = stage.timeout
        ? new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Stage timeout: ${stage.name}`)),
              stage.timeout
            )
          )
        : null;

      // Execute transformation
      const transformPromise = this.runTransformation(data, stage);

      const result = timeoutPromise
        ? await Promise.race([transformPromise, timeoutPromise])
        : await transformPromise;

      // Store stage result
      this.stageResults.set(stage.name, result);

      const duration = Date.now() - startTime;
      if (features.isEnabled('enableEnhancedLogging')) {
        console.log(
          `[PipelineManager] Stage ${stage.name} completed in ${duration}ms`
        );
      }

      return result;
    } catch (error) {
      if (stage.required) {
        throw error; // Required stage failed
      }

      if (errorStrategy === 'continue') {
        console.warn(
          `[PipelineManager] Stage ${stage.name} failed but continuing:`,
          error
        );
        return data; // Return unchanged data
      }

      throw error;
    }
  }

  /**
   * Run the actual transformation
   */
  private async runTransformation(
    data: any,
    stage: PipelineStage
  ): Promise<any> {
    if (typeof stage.pipeline === 'string') {
      // Use registered pipeline
      return dataTransformer.transform(data, stage.pipeline, {
        cache: false,
        validate: false,
        errorHandling: 'skip',
      });
    } else {
      // Use inline pipeline
      dataTransformer.registerPipeline(stage.pipeline);
      return dataTransformer.transform(data, stage.pipeline.name, {
        cache: false,
        validate: false,
        errorHandling: 'skip',
      });
    }
  }

  /**
   * Execute parallel stages
   */
  public async executeParallel(
    data: any,
    stages: PipelineStage[]
  ): Promise<any[]> {
    const promises = stages.map((stage) =>
      this.executeStage(data, stage, 'continue')
    );
    return Promise.all(promises);
  }

  /**
   * Create a conditional pipeline
   */
  public createConditionalPipeline(
    conditions: Array<{
      condition: (data: any) => boolean;
      pipeline: string | TransformationPipeline;
    }>
  ): PipelineWorkflow {
    const stages: PipelineStage[] = conditions.map((cond, index) => ({
      name: `conditional-${index}`,
      pipeline: cond.pipeline,
      condition: cond.condition,
      required: false,
    }));

    return {
      name: 'conditional-pipeline',
      stages,
      errorStrategy: 'continue',
    };
  }

  /**
   * Create a data enrichment pipeline
   */
  public createEnrichmentPipeline(
    enrichments: Array<{
      field: string;
      source: (value: any) => Promise<any>;
    }>
  ): TransformationPipeline {
    const rules = enrichments.map((enrich) => ({
      field: enrich.field,
      type: 'enrich' as const,
      config: {
        enrichFunction: enrich.source,
      },
    }));

    return {
      name: 'enrichment-pipeline',
      rules,
      errorHandling: 'skip' as const,
    };
  }

  /**
   * Rollback to original data
   */
  private rollback(originalData: any): any {
    if (features.isEnabled('enableEnhancedLogging')) {
      console.log('[PipelineManager] Rolling back transformation');
    }
    return this.deepClone(originalData);
  }

  /**
   * Get stage results for debugging
   */
  public getStageResults(): Map<string, any> {
    return new Map(this.stageResults);
  }

  /**
   * Clear all workflows
   */
  public clearWorkflows(): void {
    this.workflows.clear();
    this.stageResults.clear();
    this.rollbackStack = [];
  }

  /**
   * Helper methods
   */
  private deepClone(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
  }

  private generateCacheKey(data: any, workflow: string): string {
    const dataStr = JSON.stringify(data);
    return `workflow:${workflow}:${this.hash(dataStr)}`;
  }

  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

// Export singleton instance
export const pipelineManager = new TransformationPipelineManager();

/**
 * Pre-configured workflows
 */
export const standardWorkflows = {
  // Complete data processing workflow
  dataProcessing: {
    name: 'dataProcessing',
    stages: [
      {
        name: 'validation',
        pipeline: 'validation',
        required: true,
      },
      {
        name: 'sanitization',
        pipeline: 'dataSanitization',
        required: true,
      },
      {
        name: 'transformation',
        pipeline: 'transform',
        required: false,
      },
      {
        name: 'masking',
        pipeline: 'sensitiveDataMask',
        required: false,
        condition: (data: any) => data.hasSensitiveData,
      },
    ],
    errorStrategy: 'rollback',
    cacheResults: true,
    validateFinal: true,
  } as PipelineWorkflow,

  // OpenAI response preparation
  openaiPreparation: {
    name: 'openaiPreparation',
    stages: [
      {
        name: 'transform',
        pipeline: 'openaiSearch',
        required: true,
      },
      {
        name: 'sanitize',
        pipeline: 'dataSanitization',
        required: false,
      },
      {
        name: 'validate',
        pipeline: 'validation',
        required: true,
      },
    ],
    errorStrategy: 'continue',
    cacheResults: true,
    validateFinal: false,
  } as PipelineWorkflow,

  // Import data workflow
  dataImport: {
    name: 'dataImport',
    stages: [
      {
        name: 'normalize',
        pipeline: 'normalization',
        required: true,
      },
      {
        name: 'validate',
        pipeline: 'validation',
        required: true,
      },
      {
        name: 'enrich',
        pipeline: 'enrichment',
        required: false,
      },
      {
        name: 'deduplicate',
        pipeline: 'deduplication',
        required: false,
      },
    ],
    errorStrategy: 'fail-fast',
    cacheResults: false,
    validateFinal: true,
  } as PipelineWorkflow,
};

// Register standard workflows
if (features.isEnabled('enableDataTransformation')) {
  for (const workflow of Object.values(standardWorkflows)) {
    pipelineManager.registerWorkflow(workflow);
  }
}
