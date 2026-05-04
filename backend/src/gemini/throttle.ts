import { RetryAfterError } from 'inngest';

/**
 * Rate-limit guard for Gemini free-tier (5 requests-per-minute on Flash).
 *
 * Two layers of protection:
 *
 * 1. Process-local throttle: ensures at least MIN_INTERVAL_MS between calls.
 *    With MIN_INTERVAL_MS = 12_500, we cap at ~4.8 RPM — safely under the
 *    5 RPM free-tier ceiling. Works inside one Node process; on serverless
 *    runtimes that spawn fresh processes per step, the natural step-boundary
 *    delay (~50–500ms) gives some buffer but isn't strict — for production,
 *    upgrade to Gemini Tier 1.
 *
 * 2. RetryAfterError translation: if a 429 still slips through (cold-start
 *    races, multiple workflows running, etc.), we extract Gemini's suggested
 *    retry delay from the error message and re-throw as Inngest's
 *    RetryAfterError. Inngest then schedules the step retry exactly at that
 *    time, instead of immediate exponential backoff which would just hit
 *    another 429.
 */

const MIN_INTERVAL_MS = 12_500;

let lastCallAt = 0;

export async function withFreeTierThrottle<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) {
    console.log(`[gemini-throttle] ${label}: sleeping ${wait}ms to respect 5 RPM`);
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();

  try {
    return await fn();
  } catch (err) {
    if (isRateLimitError(err)) {
      const delayMs = parseRetryDelayMs(err) ?? 60_000;
      const seconds = Math.round(delayMs / 1000);
      console.warn(`[gemini-throttle] ${label}: 429, asking Inngest to retry in ${seconds}s`);
      throw new RetryAfterError(`${label}: Gemini rate-limited; retry after ${seconds}s`, delayMs);
    }
    throw err;
  }
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
  // Gemini error JSON contains "retryDelay":"39s"
  const match = msg.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/);
  if (match) return Math.ceil(parseFloat(match[1]!) * 1000);
  return null;
}
