import { RetryAfterError } from 'inngest';

/**
 * Rate-limit guard for Gemini free-tier (5 requests per rolling 60s window
 * on Flash models). Two layers:
 *
 * 1. Sliding-window throttle: track the timestamps of the last MAX_PER_WINDOW
 *    calls. If the oldest is less than WINDOW_MS ago, sleep until it ages
 *    out. This is strictly correct against a rolling-window limit, unlike a
 *    fixed minimum-interval throttle which can still pack N calls into the
 *    same window.
 *
 * 2. RetryAfterError translation: if a 429 still slips through (cold
 *    starts, multiple processes, Gemini's accounting being slightly behind),
 *    we re-throw as Inngest's RetryAfterError so the step retry waits the
 *    suggested delay rather than firing immediately. We also clamp the
 *    suggested delay to a sane minimum because Gemini occasionally
 *    returns retryDelay="0s" which would make Inngest retry instantly
 *    and hit 429 again.
 */

// Free tier on gemini-2.5-flash: 5 requests / rolling 60s.
// Apply a 1s safety pad so timing slop doesn't push us over.
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 61_000;

// Minimum cooldown to use whenever Gemini returns a 429 — overrides any
// shorter (or zero) retryDelay it suggests. Conservative — prevents tight
// retry loops on edge-case error responses.
const MIN_429_COOLDOWN_MS = 60_000;

const recentCalls: number[] = [];

export async function withFreeTierThrottle<T>(label: string, fn: () => Promise<T>): Promise<T> {
  // Sliding window: drop timestamps older than WINDOW_MS, then sleep if
  // we're already at MAX_PER_WINDOW.
  while (true) {
    const cutoff = Date.now() - WINDOW_MS;
    while (recentCalls.length > 0 && recentCalls[0]! < cutoff) recentCalls.shift();
    if (recentCalls.length < MAX_PER_WINDOW) break;
    const oldestAge = Date.now() - recentCalls[0]!;
    const wait = WINDOW_MS - oldestAge + 50; // +50ms safety
    console.log(
      `[gemini-throttle] ${label}: window full (${recentCalls.length}/${MAX_PER_WINDOW}), sleeping ${wait}ms`,
    );
    await sleep(wait);
  }

  recentCalls.push(Date.now());

  try {
    return await fn();
  } catch (err) {
    if (isRateLimitError(err)) {
      const suggested = parseRetryDelayMs(err);
      const delayMs = Math.max(suggested ?? 0, MIN_429_COOLDOWN_MS);
      const seconds = Math.round(delayMs / 1000);
      console.warn(
        `[gemini-throttle] ${label}: 429 (suggested=${suggested ?? 'n/a'}ms, using=${delayMs}ms). Asking Inngest to retry in ${seconds}s.`,
      );
      // After a 429, treat the next call as if we just used the whole window
      // so the throttle prevents an immediate retry collision.
      const reservation = Date.now() + delayMs;
      while (recentCalls.length < MAX_PER_WINDOW) recentCalls.push(reservation);
      throw new RetryAfterError(`${label}: Gemini rate-limited; retry after ${seconds}s`, delayMs);
    }
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: number; message?: string };
  if (e.status === 429) return true;
  const msg = e.message ?? '';
  return /\b429\b|RESOURCE_EXHAUSTED/.test(msg);
}

function parseRetryDelayMs(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const msg = (err as { message?: string }).message ?? '';
  const match = msg.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/);
  if (!match) return null;
  const ms = Math.ceil(parseFloat(match[1]!) * 1000);
  // Reject zero/negative — Gemini sometimes returns "0s" when the window
  // has technically reset on their side, but immediately retrying still
  // 429s. Treat as "no usable hint" so the caller falls back to MIN_429_COOLDOWN_MS.
  if (ms <= 0) return null;
  return ms;
}
