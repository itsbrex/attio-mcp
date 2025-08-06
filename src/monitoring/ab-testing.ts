/**
 * A/B Testing Framework
 * Provides experiment management and statistical analysis for feature rollouts
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { debug, warn } from '../utils/logger.js';

export interface Variant {
  id: string;
  name: string;
  description: string;
  percentage: number;
  config: Record<string, any>;
  metrics?: VariantMetrics;
}

export interface VariantMetrics {
  impressions: number;
  conversions: number;
  conversionRate: number;
  errors: number;
  errorRate: number;
  averageValue?: number;
  totalValue?: number;
  confidence?: number;
  pValue?: number;
  significant?: boolean;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  variants: Variant[];
  controlVariant: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: Date;
  endDate?: Date;
  targetSampleSize: number;
  currentSampleSize: number;
  primaryMetric: string;
  secondaryMetrics?: string[];
  segmentation?: {
    field: string;
    values: string[];
  };
  config: {
    minSampleSize: number;
    maxDuration: number; // days
    confidenceLevel: number; // 0.95 for 95%
    minDetectableEffect: number; // Minimum percentage difference to detect
    autoStop: boolean;
    autoStopSignificance: number;
  };
}

export interface ExperimentResult {
  experimentId: string;
  winner?: string;
  confidence: number;
  pValue: number;
  significant: boolean;
  variantResults: Map<string, VariantMetrics>;
  recommendations: string[];
}

/**
 * A/B Testing Manager
 */
export class ABTestingManager extends EventEmitter {
  private experiments: Map<string, Experiment> = new Map();
  private userAssignments: Map<string, Map<string, string>> = new Map(); // userId -> experimentId -> variantId
  private metricsBuffer: Map<string, any[]> = new Map();
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Start monitoring experiments
   */
  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      this.checkExperiments();
    }, 300000); // Check every 5 minutes

    debug('ABTestingManager', 'Monitoring started', {}, 'startMonitoring');
  }

  /**
   * Create a new experiment
   */
  public createExperiment(
    name: string,
    description: string,
    hypothesis: string,
    variants: Omit<Variant, 'metrics'>[],
    primaryMetric: string,
    config?: Partial<Experiment['config']>
  ): Experiment {
    const experimentId = crypto.randomBytes(16).toString('hex');

    // Validate variant percentages sum to 100
    const totalPercentage = variants.reduce((sum, v) => sum + v.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error('Variant percentages must sum to 100');
    }

    // Initialize variants with metrics
    const initializedVariants: Variant[] = variants.map((v) => ({
      ...v,
      metrics: {
        impressions: 0,
        conversions: 0,
        conversionRate: 0,
        errors: 0,
        errorRate: 0,
      },
    }));

    const experiment: Experiment = {
      id: experimentId,
      name,
      description,
      hypothesis,
      variants: initializedVariants,
      controlVariant: variants[0].id, // First variant is control by default
      status: 'draft',
      targetSampleSize: this.calculateSampleSize(
        config?.minDetectableEffect || 0.05,
        config?.confidenceLevel || 0.95
      ),
      currentSampleSize: 0,
      primaryMetric,
      config: {
        minSampleSize: config?.minSampleSize || 1000,
        maxDuration: config?.maxDuration || 30,
        confidenceLevel: config?.confidenceLevel || 0.95,
        minDetectableEffect: config?.minDetectableEffect || 0.05,
        autoStop: config?.autoStop !== false,
        autoStopSignificance: config?.autoStopSignificance || 0.99,
      },
    };

    this.experiments.set(experimentId, experiment);
    this.emit('experiment:created', experiment);

    debug(
      'ABTestingManager',
      `Created experiment: ${name}`,
      { id: experimentId, variants: variants.length },
      'createExperiment'
    );

    return experiment;
  }

  /**
   * Start an experiment
   */
  public startExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      warn(`[ABTestingManager] Experiment not found: ${experimentId}`);
      return false;
    }

    if (experiment.status === 'running') {
      warn(`[ABTestingManager] Experiment already running: ${experimentId}`);
      return false;
    }

    experiment.status = 'running';
    experiment.startDate = new Date();
    experiment.currentSampleSize = 0;

    this.emit('experiment:started', experiment);

    debug(
      'ABTestingManager',
      `Started experiment: ${experiment.name}`,
      { id: experimentId },
      'startExperiment'
    );

    return true;
  }

  /**
   * Get variant assignment for a user
   */
  public getVariantAssignment(
    experimentId: string,
    userId: string,
    attributes?: Record<string, any>
  ): Variant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check segmentation
    if (experiment.segmentation && attributes) {
      const segmentValue = attributes[experiment.segmentation.field];
      if (!experiment.segmentation.values.includes(segmentValue)) {
        return null; // User not in target segment
      }
    }

    // Check existing assignment
    let userExperiments = this.userAssignments.get(userId);
    if (userExperiments?.has(experimentId)) {
      const variantId = userExperiments.get(experimentId)!;
      return experiment.variants.find((v) => v.id === variantId) || null;
    }

    // Assign variant based on hash
    const variant = this.assignVariant(experiment, userId);
    
    // Store assignment
    if (!userExperiments) {
      userExperiments = new Map();
      this.userAssignments.set(userId, userExperiments);
    }
    userExperiments.set(experimentId, variant.id);

    // Record impression
    this.recordImpression(experimentId, variant.id);

    return variant;
  }

  /**
   * Assign variant using consistent hashing
   */
  private assignVariant(experiment: Experiment, userId: string): Variant {
    // Create stable hash
    const hash = crypto
      .createHash('md5')
      .update(`${experiment.id}-${userId}`)
      .digest('hex');
    
    // Convert hash to number between 0-100
    const hashNumber = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashNumber % 10000) / 100;

    // Assign based on percentage ranges
    let cumulativePercentage = 0;
    for (const variant of experiment.variants) {
      cumulativePercentage += variant.percentage;
      if (percentage < cumulativePercentage) {
        return variant;
      }
    }

    // Fallback to last variant
    return experiment.variants[experiment.variants.length - 1];
  }

  /**
   * Record an impression
   */
  public recordImpression(experimentId: string, variantId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const variant = experiment.variants.find((v) => v.id === variantId);
    if (!variant || !variant.metrics) return;

    variant.metrics.impressions++;
    experiment.currentSampleSize++;

    this.emit('experiment:impression', {
      experimentId,
      variantId,
      impressions: variant.metrics.impressions,
    });
  }

  /**
   * Record a conversion
   */
  public recordConversion(
    experimentId: string,
    variantId: string,
    value?: number
  ): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const variant = experiment.variants.find((v) => v.id === variantId);
    if (!variant || !variant.metrics) return;

    variant.metrics.conversions++;
    variant.metrics.conversionRate =
      (variant.metrics.conversions / variant.metrics.impressions) * 100;

    if (value !== undefined) {
      variant.metrics.totalValue = (variant.metrics.totalValue || 0) + value;
      variant.metrics.averageValue =
        variant.metrics.totalValue / variant.metrics.conversions;
    }

    this.emit('experiment:conversion', {
      experimentId,
      variantId,
      conversions: variant.metrics.conversions,
      value,
    });

    // Check for early stopping
    if (experiment.config.autoStop) {
      this.checkForEarlyStopping(experiment);
    }
  }

  /**
   * Record an error
   */
  public recordError(experimentId: string, variantId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return;

    const variant = experiment.variants.find((v) => v.id === variantId);
    if (!variant || !variant.metrics) return;

    variant.metrics.errors++;
    variant.metrics.errorRate =
      (variant.metrics.errors / variant.metrics.impressions) * 100;

    // Check if error rate is too high
    if (variant.metrics.errorRate > 5) {
      // 5% error rate threshold
      this.emit('experiment:high-error-rate', {
        experimentId,
        variantId,
        errorRate: variant.metrics.errorRate,
      });
    }
  }

  /**
   * Calculate required sample size
   */
  private calculateSampleSize(
    minDetectableEffect: number,
    confidenceLevel: number
  ): number {
    // Simplified sample size calculation
    // In production, use proper statistical power analysis
    const zScore = this.getZScore(confidenceLevel);
    const power = 0.8; // 80% power
    const zPower = this.getZScore(power);
    
    // Assuming baseline conversion rate of 10%
    const p1 = 0.1;
    const p2 = p1 * (1 + minDetectableEffect);
    const pBar = (p1 + p2) / 2;
    
    const sampleSize =
      (2 * Math.pow(zScore + zPower, 2) * pBar * (1 - pBar)) /
      Math.pow(p2 - p1, 2);
    
    return Math.ceil(sampleSize);
  }

  /**
   * Get Z-score for confidence level
   */
  private getZScore(confidence: number): number {
    // Common Z-scores
    const zScores: Record<number, number> = {
      0.8: 1.28,
      0.85: 1.44,
      0.9: 1.645,
      0.95: 1.96,
      0.99: 2.576,
    };
    return zScores[confidence] || 1.96;
  }

  /**
   * Calculate statistical significance
   */
  private calculateSignificance(experiment: Experiment): ExperimentResult {
    const control = experiment.variants.find(
      (v) => v.id === experiment.controlVariant
    );
    if (!control || !control.metrics) {
      throw new Error('Control variant not found');
    }

    const variantResults = new Map<string, VariantMetrics>();
    let winner: string | undefined;
    let maxLift = 0;
    let significant = false;

    for (const variant of experiment.variants) {
      if (!variant.metrics) continue;

      // Skip if not enough data
      if (variant.metrics.impressions < 100) {
        variantResults.set(variant.id, variant.metrics);
        continue;
      }

      // Calculate p-value using Chi-square test
      const pValue = this.chiSquareTest(
        control.metrics.conversions,
        control.metrics.impressions - control.metrics.conversions,
        variant.metrics.conversions,
        variant.metrics.impressions - variant.metrics.conversions
      );

      // Calculate confidence
      const confidence = 1 - pValue;

      // Calculate lift
      const lift =
        ((variant.metrics.conversionRate - control.metrics.conversionRate) /
          control.metrics.conversionRate) *
        100;

      // Update metrics
      variant.metrics.pValue = pValue;
      variant.metrics.confidence = confidence;
      variant.metrics.significant = confidence >= experiment.config.confidenceLevel;

      variantResults.set(variant.id, variant.metrics);

      // Check for winner
      if (
        variant.id !== control.id &&
        variant.metrics.significant &&
        lift > maxLift
      ) {
        winner = variant.id;
        maxLift = lift;
        significant = true;
      }
    }

    return {
      experimentId: experiment.id,
      winner,
      confidence: control.metrics.confidence || 0,
      pValue: control.metrics.pValue || 1,
      significant,
      variantResults,
      recommendations: this.generateRecommendations(experiment, variantResults),
    };
  }

  /**
   * Chi-square test for significance
   */
  private chiSquareTest(
    control_success: number,
    control_failure: number,
    variant_success: number,
    variant_failure: number
  ): number {
    const total = control_success + control_failure + variant_success + variant_failure;
    const row1 = control_success + control_failure;
    const row2 = variant_success + variant_failure;
    const col1 = control_success + variant_success;
    const col2 = control_failure + variant_failure;

    // Expected values
    const expected_control_success = (row1 * col1) / total;
    const expected_control_failure = (row1 * col2) / total;
    const expected_variant_success = (row2 * col1) / total;
    const expected_variant_failure = (row2 * col2) / total;

    // Chi-square statistic
    const chi2 =
      Math.pow(control_success - expected_control_success, 2) / expected_control_success +
      Math.pow(control_failure - expected_control_failure, 2) / expected_control_failure +
      Math.pow(variant_success - expected_variant_success, 2) / expected_variant_success +
      Math.pow(variant_failure - expected_variant_failure, 2) / expected_variant_failure;

    // Convert to p-value (simplified - use proper statistical library in production)
    // This is an approximation for df=1
    const pValue = Math.exp(-chi2 / 2);
    return Math.max(0, Math.min(1, pValue));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    experiment: Experiment,
    results: Map<string, VariantMetrics>
  ): string[] {
    const recommendations: string[] = [];

    // Check sample size
    if (experiment.currentSampleSize < experiment.config.minSampleSize) {
      recommendations.push(
        `Continue running - need ${experiment.config.minSampleSize - experiment.currentSampleSize} more samples`
      );
    }

    // Check duration
    if (experiment.startDate) {
      const daysRunning =
        (Date.now() - experiment.startDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysRunning > experiment.config.maxDuration) {
        recommendations.push('Consider stopping - exceeded maximum duration');
      }
    }

    // Check for clear winner
    let hasWinner = false;
    for (const [variantId, metrics] of results) {
      if (metrics.significant && variantId !== experiment.controlVariant) {
        hasWinner = true;
        const lift =
          ((metrics.conversionRate -
            (results.get(experiment.controlVariant)?.conversionRate || 0)) /
            (results.get(experiment.controlVariant)?.conversionRate || 1)) *
          100;
        recommendations.push(
          `Variant ${variantId} shows ${lift.toFixed(2)}% lift with ${(metrics.confidence! * 100).toFixed(1)}% confidence`
        );
      }
    }

    if (!hasWinner && experiment.currentSampleSize >= experiment.targetSampleSize) {
      recommendations.push('No significant difference detected - consider stopping');
    }

    return recommendations;
  }

  /**
   * Check for early stopping
   */
  private checkForEarlyStopping(experiment: Experiment): void {
    if (experiment.currentSampleSize < experiment.config.minSampleSize) {
      return; // Not enough data
    }

    try {
      const result = this.calculateSignificance(experiment);
      
      if (
        result.significant &&
        result.confidence >= experiment.config.autoStopSignificance
      ) {
        this.stopExperiment(experiment.id);
        this.emit('experiment:auto-stopped', {
          experimentId: experiment.id,
          winner: result.winner,
          confidence: result.confidence,
        });
      }
    } catch (error) {
      // Not enough data for significance calculation
    }
  }

  /**
   * Stop an experiment
   */
  public stopExperiment(experimentId: string): ExperimentResult | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    experiment.status = 'completed';
    experiment.endDate = new Date();

    const result = this.calculateSignificance(experiment);
    
    this.emit('experiment:completed', {
      experiment,
      result,
    });

    debug(
      'ABTestingManager',
      `Stopped experiment: ${experiment.name}`,
      { winner: result.winner, significant: result.significant },
      'stopExperiment'
    );

    return result;
  }

  /**
   * Check all running experiments
   */
  private checkExperiments(): void {
    for (const [id, experiment] of this.experiments) {
      if (experiment.status === 'running') {
        // Check for auto-stop conditions
        if (experiment.config.autoStop) {
          this.checkForEarlyStopping(experiment);
        }

        // Check for max duration
        if (experiment.startDate) {
          const daysRunning =
            (Date.now() - experiment.startDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysRunning > experiment.config.maxDuration) {
            this.stopExperiment(id);
          }
        }
      }
    }
  }

  /**
   * Get experiment status
   */
  public getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * Get all experiments
   */
  public getAllExperiments(): Map<string, Experiment> {
    return this.experiments;
  }

  /**
   * Get experiment results
   */
  public getExperimentResults(experimentId: string): ExperimentResult | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    try {
      return this.calculateSignificance(experiment);
    } catch (error) {
      return null;
    }
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const abTestingManager = new ABTestingManager();