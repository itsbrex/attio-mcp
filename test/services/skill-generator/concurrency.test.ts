/**
 * Unit tests for skill-generator concurrency helpers
 */

import { describe, it, expect, vi } from 'vitest';
import {
  mapWithConcurrency,
  withRateLimitRetry,
  isRateLimitError,
} from '@/services/skill-generator/concurrency.js';

vi.mock('@/utils/logger.js');

describe('mapWithConcurrency', () => {
  it('preserves input order in results', async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      }
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('handles empty input', async () => {
    const results = await mapWithConcurrency([], 4, async () => 1);
    expect(results).toEqual([]);
  });

  it('clamps invalid limits to 1', async () => {
    const results = await mapWithConcurrency([1, 2], 0, async (x) => x + 1);
    expect(results).toEqual([2, 3]);
  });
});

describe('isRateLimitError', () => {
  it('detects status 429 on error objects', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
  });

  it('detects rate limit messages', () => {
    expect(isRateLimitError(new Error('Request failed with status 429'))).toBe(
      true
    );
    expect(isRateLimitError(new Error('Rate limit exceeded'))).toBe(true);
  });

  it('rejects other errors', () => {
    expect(isRateLimitError(new Error('Not found'))).toBe(false);
    expect(isRateLimitError({ status: 500 })).toBe(false);
  });
});

describe('withRateLimitRetry', () => {
  it('returns the result on first success', async () => {
    const task = vi.fn().mockResolvedValue('ok');
    await expect(withRateLimitRetry(task, 'test')).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('retries rate-limited tasks and eventually succeeds', async () => {
    vi.useFakeTimers();
    try {
      const task = vi
        .fn()
        .mockRejectedValueOnce({ status: 429 })
        .mockResolvedValue('recovered');
      const promise = withRateLimitRetry(task, 'test');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('recovered');
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors Retry-After header for backoff timing', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const task = vi
        .fn()
        .mockRejectedValueOnce({
          status: 429,
          response: { status: 429, headers: { 'retry-after': '2' } },
        })
        .mockResolvedValue('ok');
      const promise = withRateLimitRetry(task, 'test');
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('ok');
      expect(setTimeoutSpy.mock.calls.some((call) => call[1] === 2000)).toBe(
        true
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rethrows non-rate-limit errors immediately', async () => {
    const task = vi.fn().mockRejectedValue(new Error('Not found'));
    await expect(withRateLimitRetry(task, 'test')).rejects.toThrow('Not found');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('gives up after max retries', async () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn().mockRejectedValue({ status: 429 });
      const promise = withRateLimitRetry(task, 'test');
      const assertion = expect(promise).rejects.toMatchObject({ status: 429 });
      await vi.runAllTimersAsync();
      await assertion;
      expect(task).toHaveBeenCalledTimes(4); // initial + 3 retries
    } finally {
      vi.useRealTimers();
    }
  });
});
