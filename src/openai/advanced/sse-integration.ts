/**
 * SSE Integration Layer
 * Enhanced Server-Sent Events capabilities with streaming and real-time features
 */

import type { ServerResponse } from 'http';
import { features } from '../../config/features.js';
import { advancedErrorHandler, ErrorCategory } from './error-handler.js';
import { searchCache, recordCache } from './cache.js';
import { debug } from '../../utils/logger.js';
import type { MCPSSEMessage } from '../../types/sse-types.js';

/**
 * SSE Event Types
 */
export enum SSEEventType {
  DATA = 'data',
  ERROR = 'error',
  STATUS = 'status',
  PROGRESS = 'progress',
  NOTIFICATION = 'notification',
  HEARTBEAT = 'heartbeat',
  MCP_RESPONSE = 'mcp_response',
  MCP_NOTIFICATION = 'mcp_notification',
  STREAM_START = 'stream_start',
  STREAM_DATA = 'stream_data',
  STREAM_END = 'stream_end',
}

/**
 * SSE Stream Options
 */
export interface SSEStreamOptions {
  enableStreaming?: boolean;
  chunkSize?: number;
  compressionEnabled?: boolean;
  progressReporting?: boolean;
  bufferSize?: number;
  flushInterval?: number;
}

/**
 * Real-time Update Configuration
 */
export interface RealtimeConfig {
  enabled?: boolean;
  updateInterval?: number;
  subscriptions?: string[];
  filters?: Record<string, any>;
  maxUpdateRate?: number;
}

/**
 * Enhanced SSE Integration
 */
export class SSEIntegration {
  private activeStreams: Map<string, StreamContext> = new Map();
  private realtimeSubscriptions: Map<string, RealtimeSubscription> = new Map();
  private eventFilters: Map<string, EventFilter> = new Map();
  private connectionMetrics: Map<string, ConnectionMetrics> = new Map();

  /**
   * Stream data to client with chunking
   */
  public async streamData(
    clientId: string,
    data: any,
    options: SSEStreamOptions = {}
  ): Promise<void> {
    if (!features.isEnabled('enableSSEStreaming')) {
      // Fallback to single message
      this.sendDataEvent(clientId, data);
      return;
    }

    const streamId = this.generateStreamId(clientId);
    const context = this.createStreamContext(streamId, options);
    this.activeStreams.set(streamId, context);

    try {
      // Send stream start event
      this.sendEvent(clientId, SSEEventType.STREAM_START, {
        streamId,
        totalSize: this.estimateDataSize(data),
        chunkSize: options.chunkSize || 1024,
      });

      // Stream data in chunks
      const chunks = this.chunkData(data, options.chunkSize || 1024);
      for (let i = 0; i < chunks.length; i++) {
        if (!this.isStreamActive(streamId)) {
          break; // Stream cancelled
        }

        // Send chunk
        this.sendEvent(clientId, SSEEventType.STREAM_DATA, {
          streamId,
          chunkIndex: i,
          totalChunks: chunks.length,
          data: chunks[i],
          progress: ((i + 1) / chunks.length) * 100,
        });

        // Report progress if enabled
        if (options.progressReporting) {
          this.sendProgressUpdate(clientId, streamId, i + 1, chunks.length);
        }

        // Apply rate limiting
        await this.applyStreamRateLimit(context);
      }

      // Send stream end event
      this.sendEvent(clientId, SSEEventType.STREAM_END, {
        streamId,
        success: true,
        chunksTransmitted: chunks.length,
      });
    } catch (error) {
      // Handle streaming error
      this.handleStreamError(clientId, streamId, error);
    } finally {
      this.activeStreams.delete(streamId);
    }
  }

  /**
   * Enable real-time updates for a client
   */
  public enableRealtimeUpdates(
    clientId: string,
    config: RealtimeConfig
  ): string {
    if (!features.isEnabled('enableRealtimeUpdates')) {
      debug('SSEIntegration', 'Real-time updates are disabled', {}, 'enableRealtimeUpdates');
      return '';
    }

    const subscriptionId = this.generateSubscriptionId(clientId);
    const subscription: RealtimeSubscription = {
      id: subscriptionId,
      clientId,
      config,
      active: true,
      createdAt: new Date(),
      lastUpdate: null,
      updateCount: 0,
    };

    this.realtimeSubscriptions.set(subscriptionId, subscription);

    // Start update loop if configured
    if (config.updateInterval && config.updateInterval > 0) {
      this.startUpdateLoop(subscriptionId);
    }

    debug('SSEIntegration', `Enabled real-time updates for ${clientId}`, { subscriptionId }, 'enableRealtimeUpdates');
    return subscriptionId;
  }

  /**
   * Disable real-time updates
   */
  public disableRealtimeUpdates(subscriptionId: string): boolean {
    const subscription = this.realtimeSubscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    subscription.active = false;
    this.realtimeSubscriptions.delete(subscriptionId);

    debug('SSEIntegration', `Disabled real-time updates`, { subscriptionId }, 'disableRealtimeUpdates');
    return true;
  }

  /**
   * Add event filter for a client
   */
  public addEventFilter(
    clientId: string,
    filterName: string,
    filterFn: (event: any) => boolean
  ): void {
    const filterId = `${clientId}:${filterName}`;
    this.eventFilters.set(filterId, {
      clientId,
      name: filterName,
      filterFn,
      active: true,
      appliedCount: 0,
    });

    debug('SSEIntegration', `Added event filter ${filterName} for ${clientId}`, {}, 'addEventFilter');
  }

  /**
   * Remove event filter
   */
  public removeEventFilter(clientId: string, filterName: string): boolean {
    const filterId = `${clientId}:${filterName}`;
    return this.eventFilters.delete(filterId);
  }

  /**
   * Enhanced event routing with filtering
   */
  public routeEvent(
    clientId: string,
    event: any,
    eventType: SSEEventType = SSEEventType.DATA
  ): boolean {
    // Apply filters
    const filters = this.getClientFilters(clientId);
    for (const filter of filters) {
      if (!filter.filterFn(event)) {
        debug('SSEIntegration', `Event blocked by filter ${filter.name}`, { clientId }, 'routeEvent');
        return false;
      }
      filter.appliedCount++;
    }

    // Update metrics
    this.updateConnectionMetrics(clientId, 'eventsSent');

    // Send event
    return this.sendEvent(clientId, eventType, event);
  }

  /**
   * Handle connection resilience
   */
  public async handleConnectionRecovery(
    clientId: string,
    lastEventId?: string
  ): Promise<void> {
    if (!features.isEnabled('enableConnectionResilience')) {
      return;
    }

    debug('SSEIntegration', `Handling connection recovery for ${clientId}`, { lastEventId }, 'handleConnectionRecovery');

    // Replay missed events from cache if available
    if (lastEventId) {
      const missedEvents = await this.getMissedEvents(clientId, lastEventId);
      for (const event of missedEvents) {
        this.sendEvent(clientId, event.type, event.data, event.id);
      }
    }

    // Re-establish subscriptions
    const subscriptions = this.getClientSubscriptions(clientId);
    for (const subscription of subscriptions) {
      if (!subscription.active) {
        subscription.active = true;
        this.startUpdateLoop(subscription.id);
      }
    }

    // Send recovery complete notification
    this.sendEvent(clientId, SSEEventType.NOTIFICATION, {
      type: 'recovery_complete',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get connection health metrics
   */
  public getConnectionHealth(clientId: string): ConnectionHealth {
    const metrics = this.connectionMetrics.get(clientId) || this.createDefaultMetrics();
    const now = Date.now();

    return {
      clientId,
      connected: true,
      uptime: now - metrics.connectedAt.getTime(),
      eventsSent: metrics.eventsSent,
      eventsReceived: metrics.eventsReceived,
      errorsCount: metrics.errors,
      latency: metrics.averageLatency,
      bandwidth: this.calculateBandwidth(metrics),
      health: this.calculateHealthScore(metrics),
    };
  }

  /**
   * Send batch updates
   */
  public async sendBatchUpdate(
    clientId: string,
    updates: any[],
    options: { compress?: boolean; priority?: number } = {}
  ): Promise<void> {
    if (!features.isEnabled('enableBatchUpdates')) {
      // Send updates individually
      for (const update of updates) {
        this.sendDataEvent(clientId, update);
      }
      return;
    }

    const batch: BatchUpdate = {
      id: this.generateBatchId(),
      timestamp: new Date().toISOString(),
      count: updates.length,
      compressed: options.compress || false,
      priority: options.priority || 0,
      items: updates,
    };

    // Compress if requested and supported
    if (options.compress && features.isEnabled('enableCompression')) {
      batch.items = await this.compressData(updates);
      batch.compressed = true;
    }

    this.sendEvent(clientId, SSEEventType.DATA, batch);
  }

  /**
   * Private helper methods
   */

  private createStreamContext(
    streamId: string,
    options: SSEStreamOptions
  ): StreamContext {
    return {
      id: streamId,
      startTime: Date.now(),
      bytesTransmitted: 0,
      chunksTransmitted: 0,
      options,
      active: true,
    };
  }

  private chunkData(data: any, chunkSize: number): any[] {
    const jsonStr = JSON.stringify(data);
    const chunks: string[] = [];

    for (let i = 0; i < jsonStr.length; i += chunkSize) {
      chunks.push(jsonStr.slice(i, i + chunkSize));
    }

    return chunks;
  }

  private async applyStreamRateLimit(context: StreamContext): Promise<void> {
    const flushInterval = context.options.flushInterval || 10;
    if (flushInterval > 0) {
      await new Promise((resolve) => setTimeout(resolve, flushInterval));
    }
  }

  private handleStreamError(clientId: string, streamId: string, error: any): void {
    const errorContext = advancedErrorHandler.createErrorContext(error, {
      clientId,
      streamId,
    });

    this.sendEvent(clientId, SSEEventType.ERROR, {
      streamId,
      error: {
        message: errorContext.originalError?.message || 'Stream error occurred',
        category: errorContext.category,
        timestamp: errorContext.timestamp,
      },
    });

    // Clean up stream
    this.activeStreams.delete(streamId);
  }

  private startUpdateLoop(subscriptionId: string): void {
    const subscription = this.realtimeSubscriptions.get(subscriptionId);
    if (!subscription || !subscription.active) {
      return;
    }

    const interval = subscription.config.updateInterval || 5000;
    const loop = async () => {
      if (!subscription.active) {
        return;
      }

      try {
        // Fetch updates based on subscription config
        const updates = await this.fetchUpdates(subscription);
        if (updates.length > 0) {
          this.sendEvent(subscription.clientId, SSEEventType.NOTIFICATION, {
            type: 'realtime_update',
            subscriptionId,
            updates,
            timestamp: new Date().toISOString(),
          });

          subscription.lastUpdate = new Date();
          subscription.updateCount++;
        }
      } catch (error) {
        debug('SSEIntegration', `Update loop error for ${subscriptionId}`, { error }, 'startUpdateLoop');
      }

      // Schedule next update
      if (subscription.active) {
        setTimeout(() => loop(), interval);
      }
    };

    // Start the loop
    setTimeout(() => loop(), interval);
  }

  private async fetchUpdates(subscription: RealtimeSubscription): Promise<any[]> {
    // Placeholder for fetching updates based on subscription config
    // This would integrate with the actual data sources
    const updates: any[] = [];

    if (subscription.config.subscriptions) {
      for (const topic of subscription.config.subscriptions) {
        // Check cache for updates
        const cacheKey = `updates:${topic}:${subscription.lastUpdate?.toISOString() || 'all'}`;
        const cached = searchCache.get(cacheKey);
        if (cached) {
          updates.push(...cached);
        }
      }
    }

    return updates;
  }

  private async getMissedEvents(
    clientId: string,
    lastEventId: string
  ): Promise<any[]> {
    // Retrieve missed events from event log or cache
    const events: any[] = [];
    
    // This would integrate with an event store or cache
    // For now, return empty array
    return events;
  }

  private getClientFilters(clientId: string): EventFilter[] {
    const filters: EventFilter[] = [];
    
    for (const [filterId, filter] of this.eventFilters) {
      if (filter.clientId === clientId && filter.active) {
        filters.push(filter);
      }
    }

    return filters;
  }

  private getClientSubscriptions(clientId: string): RealtimeSubscription[] {
    const subscriptions: RealtimeSubscription[] = [];
    
    for (const subscription of this.realtimeSubscriptions.values()) {
      if (subscription.clientId === clientId) {
        subscriptions.push(subscription);
      }
    }

    return subscriptions;
  }

  private updateConnectionMetrics(clientId: string, metric: string): void {
    const metrics = this.connectionMetrics.get(clientId) || this.createDefaultMetrics();
    
    switch (metric) {
      case 'eventsSent':
        metrics.eventsSent++;
        break;
      case 'eventsReceived':
        metrics.eventsReceived++;
        break;
      case 'error':
        metrics.errors++;
        break;
    }

    this.connectionMetrics.set(clientId, metrics);
  }

  private createDefaultMetrics(): ConnectionMetrics {
    return {
      connectedAt: new Date(),
      eventsSent: 0,
      eventsReceived: 0,
      errors: 0,
      bytesTransmitted: 0,
      averageLatency: 0,
    };
  }

  private calculateBandwidth(metrics: ConnectionMetrics): number {
    const duration = Date.now() - metrics.connectedAt.getTime();
    if (duration === 0) return 0;
    return (metrics.bytesTransmitted / duration) * 1000; // bytes per second
  }

  private calculateHealthScore(metrics: ConnectionMetrics): number {
    // Calculate health score (0-100)
    let score = 100;
    
    // Deduct for errors
    score -= Math.min(metrics.errors * 5, 50);
    
    // Deduct for high latency
    if (metrics.averageLatency > 1000) {
      score -= 20;
    } else if (metrics.averageLatency > 500) {
      score -= 10;
    }

    return Math.max(score, 0);
  }

  private sendEvent(
    clientId: string,
    eventType: SSEEventType,
    data: any,
    eventId?: string
  ): boolean {
    // This would integrate with the actual SSE server
    // For now, return true
    debug('SSEIntegration', `Sending ${eventType} event to ${clientId}`, { eventId }, 'sendEvent');
    return true;
  }

  private sendDataEvent(clientId: string, data: any): boolean {
    return this.sendEvent(clientId, SSEEventType.DATA, data);
  }

  private sendProgressUpdate(
    clientId: string,
    streamId: string,
    current: number,
    total: number
  ): void {
    this.sendEvent(clientId, SSEEventType.PROGRESS, {
      streamId,
      current,
      total,
      percentage: (current / total) * 100,
    });
  }

  private generateStreamId(clientId: string): string {
    return `stream-${clientId}-${Date.now()}`;
  }

  private generateSubscriptionId(clientId: string): string {
    return `sub-${clientId}-${Date.now()}`;
  }

  private generateBatchId(): string {
    return `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateDataSize(data: any): number {
    return JSON.stringify(data).length;
  }

  private isStreamActive(streamId: string): boolean {
    const context = this.activeStreams.get(streamId);
    return context?.active || false;
  }

  private async compressData(data: any): Promise<any> {
    // Placeholder for compression
    // Would use a compression library like pako or zlib
    return data;
  }
}

/**
 * Type definitions
 */

interface StreamContext {
  id: string;
  startTime: number;
  bytesTransmitted: number;
  chunksTransmitted: number;
  options: SSEStreamOptions;
  active: boolean;
}

interface RealtimeSubscription {
  id: string;
  clientId: string;
  config: RealtimeConfig;
  active: boolean;
  createdAt: Date;
  lastUpdate: Date | null;
  updateCount: number;
}

interface EventFilter {
  clientId: string;
  name: string;
  filterFn: (event: any) => boolean;
  active: boolean;
  appliedCount: number;
}

interface ConnectionMetrics {
  connectedAt: Date;
  eventsSent: number;
  eventsReceived: number;
  errors: number;
  bytesTransmitted: number;
  averageLatency: number;
}

interface ConnectionHealth {
  clientId: string;
  connected: boolean;
  uptime: number;
  eventsSent: number;
  eventsReceived: number;
  errorsCount: number;
  latency: number;
  bandwidth: number;
  health: number;
}

interface BatchUpdate {
  id: string;
  timestamp: string;
  count: number;
  compressed: boolean;
  priority: number;
  items: any[];
}

// Export singleton instance
export const sseIntegration = new SSEIntegration();