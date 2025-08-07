/**
 * Tests for SSE Integration Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sseIntegration,
  SSEEventType,
  SSEStreamOptions,
  RealtimeConfig,
} from '../../src/openai/advanced/sse-integration.js';
import { features } from '../../src/config/features.js';

describe('SSE Integration Layer', () => {
  beforeEach(() => {
    // Enable all SSE features for testing
    features.updateFlags({
      enableSSEStreaming: true,
      enableRealtimeUpdates: true,
      enableConnectionResilience: true,
      enableBatchUpdates: true,
      enableCompression: true,
      enableEnhancedLogging: false,
    });
  });

  afterEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Data Streaming', () => {
    it('should stream data in chunks', async () => {
      const clientId = 'test-client-1';
      const largeData = {
        items: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            description: `Description for item ${i}`,
          })),
      };

      const options: SSEStreamOptions = {
        enableStreaming: true,
        chunkSize: 512,
        progressReporting: true,
      };

      // Mock the sendEvent method
      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.streamData(clientId, largeData, options);

      // Verify stream events were sent
      const calls = sendEventSpy.mock.calls;

      // Should have stream start event
      const startCall = calls.find((c) => c[1] === SSEEventType.STREAM_START);
      expect(startCall).toBeDefined();
      expect(startCall?.[2]).toHaveProperty('streamId');
      expect(startCall?.[2]).toHaveProperty('chunkSize', 512);

      // Should have stream data events
      const dataEvents = calls.filter((c) => c[1] === SSEEventType.STREAM_DATA);
      expect(dataEvents.length).toBeGreaterThan(0);

      // Should have stream end event
      const endCall = calls.find((c) => c[1] === SSEEventType.STREAM_END);
      expect(endCall).toBeDefined();
      expect(endCall?.[2]).toHaveProperty('success', true);

      sendEventSpy.mockRestore();
    });

    it('should fall back to single message when streaming is disabled', async () => {
      features.updateFlags({ enableSSEStreaming: false });

      const clientId = 'test-client-2';
      const data = { message: 'test' };

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.streamData(clientId, data);

      // Should send single data event
      expect(sendEventSpy).toHaveBeenCalledTimes(1);
      expect(sendEventSpy.mock.calls[0][1]).toBe(SSEEventType.DATA);

      sendEventSpy.mockRestore();
    });

    it('should report progress during streaming', async () => {
      const clientId = 'test-client-3';
      const data = { items: Array(10).fill({ test: 'data' }) };

      const options: SSEStreamOptions = {
        enableStreaming: true,
        chunkSize: 100,
        progressReporting: true,
      };

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.streamData(clientId, data, options);

      // Check for progress events
      const progressEvents = sendEventSpy.mock.calls.filter(
        (c) => c[1] === SSEEventType.PROGRESS
      );
      expect(progressEvents.length).toBeGreaterThan(0);

      sendEventSpy.mockRestore();
    });
  });

  describe('Real-time Updates', () => {
    it('should enable real-time updates for a client', () => {
      const clientId = 'test-client-4';
      const config: RealtimeConfig = {
        enabled: true,
        updateInterval: 5000,
        subscriptions: ['companies', 'deals'],
        filters: { status: 'active' },
      };

      const subscriptionId = sseIntegration.enableRealtimeUpdates(
        clientId,
        config
      );

      expect(subscriptionId).toBeTruthy();
      expect(subscriptionId).toContain('sub-');
    });

    it('should disable real-time updates', () => {
      const clientId = 'test-client-5';
      const config: RealtimeConfig = { enabled: true };

      const subscriptionId = sseIntegration.enableRealtimeUpdates(
        clientId,
        config
      );
      const result = sseIntegration.disableRealtimeUpdates(subscriptionId);

      expect(result).toBe(true);
    });

    it('should return empty string when real-time updates are disabled', () => {
      features.updateFlags({ enableRealtimeUpdates: false });

      const clientId = 'test-client-6';
      const config: RealtimeConfig = { enabled: true };

      const subscriptionId = sseIntegration.enableRealtimeUpdates(
        clientId,
        config
      );

      expect(subscriptionId).toBe('');
    });
  });

  describe('Event Filtering', () => {
    it('should add event filter for a client', () => {
      const clientId = 'test-client-7';
      const filterName = 'statusFilter';
      const filterFn = (event: any) => event.status === 'active';

      sseIntegration.addEventFilter(clientId, filterName, filterFn);

      // Test filter by routing an event
      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      // This event should pass the filter
      const result1 = sseIntegration.routeEvent(clientId, { status: 'active' });
      expect(result1).toBe(true);

      // This event should be blocked by the filter
      const result2 = sseIntegration.routeEvent(clientId, {
        status: 'inactive',
      });
      expect(result2).toBe(false);

      sendEventSpy.mockRestore();
    });

    it('should remove event filter', () => {
      const clientId = 'test-client-8';
      const filterName = 'testFilter';
      const filterFn = () => true;

      sseIntegration.addEventFilter(clientId, filterName, filterFn);
      const result = sseIntegration.removeEventFilter(clientId, filterName);

      expect(result).toBe(true);
    });

    it('should apply multiple filters', () => {
      const clientId = 'test-client-9';

      sseIntegration.addEventFilter(
        clientId,
        'statusFilter',
        (event) => event.status === 'active'
      );

      sseIntegration.addEventFilter(
        clientId,
        'typeFilter',
        (event) => event.type === 'company'
      );

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      // Event that passes both filters
      const result1 = sseIntegration.routeEvent(clientId, {
        status: 'active',
        type: 'company',
      });
      expect(result1).toBe(true);

      // Event that fails one filter
      const result2 = sseIntegration.routeEvent(clientId, {
        status: 'inactive',
        type: 'company',
      });
      expect(result2).toBe(false);

      sendEventSpy.mockRestore();
    });
  });

  describe('Connection Resilience', () => {
    it('should handle connection recovery', async () => {
      const clientId = 'test-client-10';
      const lastEventId = 'event-123';

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.handleConnectionRecovery(clientId, lastEventId);

      // Should send recovery complete notification
      const recoveryCall = sendEventSpy.mock.calls.find(
        (c) =>
          c[1] === SSEEventType.NOTIFICATION &&
          c[2]?.type === 'recovery_complete'
      );
      expect(recoveryCall).toBeDefined();

      sendEventSpy.mockRestore();
    });

    it('should skip recovery when feature is disabled', async () => {
      features.updateFlags({ enableConnectionResilience: false });

      const clientId = 'test-client-11';
      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');

      await sseIntegration.handleConnectionRecovery(clientId);

      // Should not send any events
      expect(sendEventSpy).not.toHaveBeenCalled();

      sendEventSpy.mockRestore();
    });
  });

  describe('Connection Health', () => {
    it('should return connection health metrics', () => {
      const clientId = 'test-client-12';

      // Update some metrics
      const updateMetricsSpy = vi.spyOn(
        sseIntegration as any,
        'updateConnectionMetrics'
      );
      updateMetricsSpy.mockImplementation(() => {});

      sseIntegration.routeEvent(clientId, { test: 'data' });

      const health = sseIntegration.getConnectionHealth(clientId);

      expect(health).toHaveProperty('clientId', clientId);
      expect(health).toHaveProperty('connected', true);
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('eventsSent');
      expect(health).toHaveProperty('health');
      expect(health.health).toBeGreaterThanOrEqual(0);
      expect(health.health).toBeLessThanOrEqual(100);

      updateMetricsSpy.mockRestore();
    });

    it('should calculate health score based on metrics', () => {
      const clientId = 'test-client-13';

      // Create metrics with errors
      const metrics = {
        connectedAt: new Date(),
        eventsSent: 100,
        eventsReceived: 50,
        errors: 5,
        bytesTransmitted: 1024,
        averageLatency: 200,
      };

      const metricsMap = sseIntegration['connectionMetrics'] as Map<
        string,
        any
      >;
      metricsMap.set(clientId, metrics);

      const health = sseIntegration.getConnectionHealth(clientId);

      // Health should be reduced due to errors
      expect(health.health).toBeLessThan(100);
      expect(health.errorsCount).toBe(5);
    });
  });

  describe('Batch Updates', () => {
    it('should send batch updates', async () => {
      const clientId = 'test-client-14';
      const updates = [
        { id: 1, data: 'update1' },
        { id: 2, data: 'update2' },
        { id: 3, data: 'update3' },
      ];

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.sendBatchUpdate(clientId, updates);

      // Should send batch event
      expect(sendEventSpy).toHaveBeenCalledTimes(1);
      const call = sendEventSpy.mock.calls[0];
      expect(call[1]).toBe(SSEEventType.DATA);
      expect(call[2]).toHaveProperty('count', 3);
      expect(call[2]).toHaveProperty('items');
      expect(call[2].items).toHaveLength(3);

      sendEventSpy.mockRestore();
    });

    it('should fall back to individual updates when batching is disabled', async () => {
      features.updateFlags({ enableBatchUpdates: false });

      const clientId = 'test-client-15';
      const updates = [
        { id: 1, data: 'update1' },
        { id: 2, data: 'update2' },
      ];

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.sendBatchUpdate(clientId, updates);

      // Should send individual events
      expect(sendEventSpy).toHaveBeenCalledTimes(2);

      sendEventSpy.mockRestore();
    });

    it('should support compression in batch updates', async () => {
      const clientId = 'test-client-16';
      const updates = [{ large: 'data'.repeat(100) }];

      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      await sseIntegration.sendBatchUpdate(clientId, updates, {
        compress: true,
      });

      const call = sendEventSpy.mock.calls[0];
      expect(call[2]).toHaveProperty('compressed');

      sendEventSpy.mockRestore();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain backward compatibility with all features disabled', async () => {
      // Disable all features
      features.updateFlags({
        enableSSEStreaming: false,
        enableRealtimeUpdates: false,
        enableConnectionResilience: false,
        enableBatchUpdates: false,
        enableCompression: false,
      });

      const clientId = 'test-client-17';
      const sendEventSpy = vi.spyOn(sseIntegration as any, 'sendEvent');
      sendEventSpy.mockReturnValue(true);

      // Stream should fall back to single message
      await sseIntegration.streamData(clientId, { test: 'data' });
      expect(sendEventSpy).toHaveBeenCalledTimes(1);

      // Real-time updates should return empty
      const subId = sseIntegration.enableRealtimeUpdates(clientId, {
        enabled: true,
      });
      expect(subId).toBe('');

      // Batch updates should send individually
      sendEventSpy.mockClear();
      await sseIntegration.sendBatchUpdate(clientId, [{ a: 1 }, { b: 2 }]);
      expect(sendEventSpy).toHaveBeenCalledTimes(2);

      sendEventSpy.mockRestore();
    });
  });
});
