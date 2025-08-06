/**
 * Rollout Strategy and Monitoring Manager
 * Provides staged rollout with monitoring and rollback capabilities
 */

import { features } from '../config/features.js';
import { EventEmitter } from 'events';
import { debug, warn, error as logError } from '../utils/logger.js';

export interface RolloutStage {
  name: string;
  percentage: number;
  startDate?: Date;
  endDate?: Date;
  criteria: {
    minDuration?: number; // Minimum hours before progressing
    maxErrors?: number;
    maxLatency?: number; // ms
    minSuccessRate?: number; // percentage
  };
  status: 'pending' | 'active' | 'completed' | 'failed' | 'rolled-back';
}

export interface FeatureRollout {
  featureName: string;
  description: string;
  stages: RolloutStage[];
  currentStage: number;
  metrics: RolloutMetrics;
  config: {
    autoProgress: boolean;
    autoRollback: boolean;
    notifyOnProgress: boolean;
    notifyOnRollback: boolean;
  };
  status: 'planned' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  createdAt: Date;
  updatedAt: Date;
}

export interface RolloutMetrics {
  requests: number;
  errors: number;
  successRate: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  lastError?: Error;
  lastErrorTime?: Date;
  userFeedback?: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface MonitoringAlert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  feature: string;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
}

/**
 * Rollout Manager for staged feature deployment
 */
export class RolloutManager extends EventEmitter {
  private rollouts: Map<string, FeatureRollout> = new Map();
  private alerts: MonitoringAlert[] = [];
  private metricsCollector: Map<string, number[]> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private readonly alertThresholds = {
    errorRate: 0.05, // 5% error rate
    latencyP95: 1000, // 1 second
    latencyP99: 2000, // 2 seconds
    successRate: 0.95, // 95% success rate
  };

  constructor() {
    super();
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring system
   */
  private initializeMonitoring(): void {
    // Start monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.checkRolloutHealth();
    }, 60000); // Check every minute

    debug(
      'RolloutManager',
      'Monitoring system initialized',
      {},
      'initializeMonitoring'
    );
  }

  /**
   * Create a new feature rollout plan
   */
  public createRollout(
    featureName: string,
    description: string,
    stages?: RolloutStage[]
  ): FeatureRollout {
    const defaultStages: RolloutStage[] = [
      {
        name: 'Canary',
        percentage: 1,
        criteria: {
          minDuration: 24, // 24 hours
          maxErrors: 10,
          maxLatency: 500,
          minSuccessRate: 99,
        },
        status: 'pending',
      },
      {
        name: 'Early Adopters',
        percentage: 5,
        criteria: {
          minDuration: 48,
          maxErrors: 50,
          maxLatency: 750,
          minSuccessRate: 98,
        },
        status: 'pending',
      },
      {
        name: 'Beta',
        percentage: 25,
        criteria: {
          minDuration: 72,
          maxErrors: 100,
          maxLatency: 1000,
          minSuccessRate: 97,
        },
        status: 'pending',
      },
      {
        name: 'General Availability',
        percentage: 100,
        criteria: {
          minSuccessRate: 95,
        },
        status: 'pending',
      },
    ];

    const rollout: FeatureRollout = {
      featureName,
      description,
      stages: stages || defaultStages,
      currentStage: -1, // Not started
      metrics: {
        requests: 0,
        errors: 0,
        successRate: 100,
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
      },
      config: {
        autoProgress: true,
        autoRollback: true,
        notifyOnProgress: true,
        notifyOnRollback: true,
      },
      status: 'planned',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rollouts.set(featureName, rollout);
    this.emit('rollout:created', rollout);

    debug(
      'RolloutManager',
      `Created rollout plan for ${featureName}`,
      { stages: rollout.stages.length },
      'createRollout'
    );

    return rollout;
  }

  /**
   * Start or progress a feature rollout
   */
  public async progressRollout(featureName: string): Promise<boolean> {
    const rollout = this.rollouts.get(featureName);
    if (!rollout) {
      warn('RolloutManager', `Rollout not found: ${featureName}`);
      return false;
    }

    // Check if we can progress
    if (rollout.currentStage >= rollout.stages.length - 1) {
      debug(
        'RolloutManager',
        `Rollout already completed for ${featureName}`,
        {},
        'progressRollout'
      );
      return false;
    }

    // Check current stage health
    if (rollout.currentStage >= 0) {
      const currentStage = rollout.stages[rollout.currentStage];
      if (!this.checkStageCriteria(currentStage, rollout.metrics)) {
        warn(
          'RolloutManager',
          `Stage criteria not met for ${featureName}:${currentStage.name}`
        );
        return false;
      }
    }

    // Progress to next stage
    rollout.currentStage++;
    const newStage = rollout.stages[rollout.currentStage];
    newStage.status = 'active';
    newStage.startDate = new Date();

    if (rollout.currentStage > 0) {
      const prevStage = rollout.stages[rollout.currentStage - 1];
      prevStage.status = 'completed';
      prevStage.endDate = new Date();
    }

    rollout.status = 'in-progress';
    rollout.updatedAt = new Date();

    // Update feature flags
    this.applyRolloutPercentage(featureName, newStage.percentage);

    // Emit event
    this.emit('rollout:progressed', {
      feature: featureName,
      stage: newStage.name,
      percentage: newStage.percentage,
    });

    debug(
      'RolloutManager',
      `Progressed rollout for ${featureName} to ${newStage.name} (${newStage.percentage}%)`,
      { stage: rollout.currentStage },
      'progressRollout'
    );

    return true;
  }

  /**
   * Rollback a feature
   */
  public async rollbackFeature(
    featureName: string,
    reason: string
  ): Promise<boolean> {
    const rollout = this.rollouts.get(featureName);
    if (!rollout) {
      warn('RolloutManager', `Rollout not found for rollback: ${featureName}`);
      return false;
    }

    // Disable the feature
    features.updateFlags({ [featureName]: false });

    // Update rollout status
    if (rollout.currentStage >= 0) {
      rollout.stages[rollout.currentStage].status = 'rolled-back';
      rollout.stages[rollout.currentStage].endDate = new Date();
    }
    rollout.status = 'rolled-back';
    rollout.updatedAt = new Date();

    // Create alert
    this.createAlert(
      'critical',
      featureName,
      `Feature rolled back: ${reason}`,
      'rollback',
      1,
      0
    );

    // Emit event
    this.emit('rollout:rollback', {
      feature: featureName,
      reason,
      stage: rollout.currentStage >= 0 
        ? rollout.stages[rollout.currentStage].name 
        : 'pre-rollout',
    });

    logError(
      'RolloutManager',
      `Rolled back feature ${featureName}: ${reason}`
    );

    return true;
  }

  /**
   * Record metrics for a feature
   */
  public recordMetric(
    featureName: string,
    success: boolean,
    latency: number
  ): void {
    const rollout = this.rollouts.get(featureName);
    if (!rollout) return;

    // Update basic metrics
    rollout.metrics.requests++;
    if (!success) {
      rollout.metrics.errors++;
    }
    rollout.metrics.successRate =
      ((rollout.metrics.requests - rollout.metrics.errors) /
        rollout.metrics.requests) *
      100;

    // Store latency for percentile calculations
    const latencies = this.metricsCollector.get(featureName) || [];
    latencies.push(latency);
    if (latencies.length > 10000) {
      // Keep only last 10k measurements
      latencies.shift();
    }
    this.metricsCollector.set(featureName, latencies);

    // Calculate latency percentiles
    if (latencies.length > 0) {
      const sorted = [...latencies].sort((a, b) => a - b);
      rollout.metrics.averageLatency =
        latencies.reduce((a, b) => a + b, 0) / latencies.length;
      rollout.metrics.p95Latency = sorted[Math.floor(sorted.length * 0.95)];
      rollout.metrics.p99Latency = sorted[Math.floor(sorted.length * 0.99)];
    }

    // Check for threshold violations
    this.checkThresholds(featureName, rollout);
  }

  /**
   * Record user feedback
   */
  public recordUserFeedback(
    featureName: string,
    feedback: 'positive' | 'negative' | 'neutral'
  ): void {
    const rollout = this.rollouts.get(featureName);
    if (!rollout) return;

    if (!rollout.metrics.userFeedback) {
      rollout.metrics.userFeedback = {
        positive: 0,
        negative: 0,
        neutral: 0,
      };
    }

    rollout.metrics.userFeedback[feedback]++;

    // Check if negative feedback is too high
    const total =
      rollout.metrics.userFeedback.positive +
      rollout.metrics.userFeedback.negative +
      rollout.metrics.userFeedback.neutral;

    if (
      total > 10 &&
      rollout.metrics.userFeedback.negative / total > 0.3 // 30% negative
    ) {
      this.createAlert(
        'warning',
        featureName,
        'High negative user feedback',
        'feedback',
        rollout.metrics.userFeedback.negative / total,
        0.3
      );
    }
  }

  /**
   * Check if stage criteria are met
   */
  private checkStageCriteria(
    stage: RolloutStage,
    metrics: RolloutMetrics
  ): boolean {
    // Check minimum duration
    if (stage.criteria.minDuration && stage.startDate) {
      const hoursElapsed =
        (Date.now() - stage.startDate.getTime()) / (1000 * 60 * 60);
      if (hoursElapsed < stage.criteria.minDuration) {
        return false;
      }
    }

    // Check error threshold
    if (
      stage.criteria.maxErrors !== undefined &&
      metrics.errors > stage.criteria.maxErrors
    ) {
      return false;
    }

    // Check latency threshold
    if (
      stage.criteria.maxLatency !== undefined &&
      metrics.p95Latency > stage.criteria.maxLatency
    ) {
      return false;
    }

    // Check success rate threshold
    if (
      stage.criteria.minSuccessRate !== undefined &&
      metrics.successRate < stage.criteria.minSuccessRate
    ) {
      return false;
    }

    return true;
  }

  /**
   * Apply rollout percentage to feature flags
   */
  private applyRolloutPercentage(featureName: string, percentage: number): void {
    // Simple hash-based rollout
    // In production, this would use user IDs or other stable identifiers
    const rolloutEnabled = Math.random() * 100 < percentage;
    features.updateFlags({ [featureName]: rolloutEnabled });

    debug(
      'RolloutManager',
      `Applied ${percentage}% rollout for ${featureName}`,
      { enabled: rolloutEnabled },
      'applyRolloutPercentage'
    );
  }

  /**
   * Check metric thresholds and create alerts
   */
  private checkThresholds(featureName: string, rollout: FeatureRollout): void {
    const metrics = rollout.metrics;

    // Check error rate
    const errorRate = metrics.errors / metrics.requests;
    if (errorRate > this.alertThresholds.errorRate) {
      this.createAlert(
        'error',
        featureName,
        'High error rate detected',
        'errorRate',
        errorRate,
        this.alertThresholds.errorRate
      );

      // Auto-rollback if configured
      if (rollout.config.autoRollback) {
        this.rollbackFeature(featureName, 'High error rate');
      }
    }

    // Check latency
    if (metrics.p95Latency > this.alertThresholds.latencyP95) {
      this.createAlert(
        'warning',
        featureName,
        'High P95 latency detected',
        'latencyP95',
        metrics.p95Latency,
        this.alertThresholds.latencyP95
      );
    }

    if (metrics.p99Latency > this.alertThresholds.latencyP99) {
      this.createAlert(
        'error',
        featureName,
        'High P99 latency detected',
        'latencyP99',
        metrics.p99Latency,
        this.alertThresholds.latencyP99
      );
    }

    // Check success rate
    if (metrics.successRate < this.alertThresholds.successRate * 100) {
      this.createAlert(
        'error',
        featureName,
        'Low success rate detected',
        'successRate',
        metrics.successRate,
        this.alertThresholds.successRate * 100
      );

      // Auto-rollback if configured
      if (rollout.config.autoRollback) {
        this.rollbackFeature(featureName, 'Low success rate');
      }
    }
  }

  /**
   * Create a monitoring alert
   */
  private createAlert(
    severity: MonitoringAlert['severity'],
    feature: string,
    message: string,
    metric: string,
    value: number,
    threshold: number
  ): void {
    const alert: MonitoringAlert = {
      id: `${feature}-${metric}-${Date.now()}`,
      severity,
      feature,
      message,
      metric,
      value,
      threshold,
      timestamp: new Date(),
      resolved: false,
    };

    this.alerts.push(alert);
    this.emit('alert:created', alert);

    // Log based on severity
    if (severity === 'critical' || severity === 'error') {
      logError('RolloutManager', `[Alert] ${message} - ${feature}: ${value} > ${threshold}`);
    } else {
      warn('RolloutManager', `[Alert] ${message} - ${feature}: ${value} > ${threshold}`);
    }
  }

  /**
   * Check health of all active rollouts
   */
  private checkRolloutHealth(): void {
    for (const [featureName, rollout] of this.rollouts) {
      if (rollout.status === 'in-progress') {
        // Check if current stage should auto-progress
        if (
          rollout.config.autoProgress &&
          rollout.currentStage >= 0 &&
          rollout.currentStage < rollout.stages.length - 1
        ) {
          const currentStage = rollout.stages[rollout.currentStage];
          if (this.checkStageCriteria(currentStage, rollout.metrics)) {
            this.progressRollout(featureName);
          }
        }

        // Check overall health
        this.checkThresholds(featureName, rollout);
      }
    }
  }

  /**
   * Get rollout status
   */
  public getRolloutStatus(featureName: string): FeatureRollout | undefined {
    return this.rollouts.get(featureName);
  }

  /**
   * Get all rollouts
   */
  public getAllRollouts(): Map<string, FeatureRollout> {
    return this.rollouts;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): MonitoringAlert[] {
    return this.alerts.filter((a) => !a.resolved);
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alert:resolved', alert);
    }
  }

  /**
   * Get rollout metrics summary
   */
  public getMetricsSummary(): Record<string, RolloutMetrics> {
    const summary: Record<string, RolloutMetrics> = {};
    for (const [feature, rollout] of this.rollouts) {
      summary[feature] = rollout.metrics;
    }
    return summary;
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const rolloutManager = new RolloutManager();