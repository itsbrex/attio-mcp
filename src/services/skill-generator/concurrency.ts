/**
 * Concurrency helpers for the skill generator.
 *
 * Replaces the serial fetch-with-fixed-delay pattern with bounded parallelism
 * plus rate-limit-aware retries (HTTP 429 / Retry-After).
 */

import { warn as logWarn } from '@/utils/logger.js';

/** Default number of concurrent fetches */
export const DEFAULT_CONCURRENCY = 4;

/** Maximum retry attempts for rate-limited requests */
const MAX_RETRIES = 3;

/** Base backoff in milliseconds when no Retry-After header is present */
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts an HTTP status code from an unknown error shape
 * (axios errors, fetch-style errors, or plain objects).
 */
function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const err = error as {
    status?: unknown;
    response?: { status?: unknown };
  };
  if (typeof err.status === 'number') return err.status;
  if (typeof err.response?.status === 'number') return err.response.status;
  return undefined;
}

/**
 * Extracts a Retry-After delay (in ms) from an unknown error shape.
 */
function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const headers = (
    error as { response?: { headers?: Record<string, unknown> } }
  ).response?.headers;
  const raw = headers?.['retry-after'];
  if (typeof raw === 'string' || typeof raw === 'number') {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return undefined;
}

/**
 * Returns true when an error looks like a rate-limit rejection.
 * Falls back to message sniffing because some service layers wrap the
 * original axios error into a plain Error.
 */
export function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|rate limit/i.test(message);
}

/**
 * Runs a task, retrying with backoff when the failure is a rate limit.
 * Non-rate-limit errors are rethrown immediately.
 *
 * @param task - The async task to run
 * @param label - Label used in retry log messages
 */
export async function withRateLimitRetry<T>(
  task: () => Promise<T>,
  label: string
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await task();
    } catch (error: unknown) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt > MAX_RETRIES) {
        throw error;
      }
      const backoffMs =
        getRetryAfterMs(error) ?? BASE_BACKOFF_MS * 2 ** (attempt - 1);
      logWarn(
        'skill-generator/concurrency',
        `Rate limited on ${label}; retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRIES})`,
        { label, attempt, backoffMs }
      );
      await sleep(backoffMs);
    }
  }
}

/**
 * Maps items through an async function with bounded concurrency,
 * preserving input order in the results.
 *
 * @param items - Items to process
 * @param limit - Maximum number of tasks in flight
 * @param fn - Async mapper
 * @param delayMs - Optional pause a worker takes after each task
 *                  (keeps backward compatibility with optionFetchDelayMs)
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  delayMs = 0
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  const effectiveLimit = Math.max(1, Math.floor(limit) || 1);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
      if (delayMs > 0 && nextIndex < items.length) {
        await sleep(delayMs);
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(effectiveLimit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
