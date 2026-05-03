/**
 * Wrap any promise with a hard deadline. If the promise doesn't resolve within
 * `ms` milliseconds, reject with a labelled TimeoutError.
 *
 * Used to bound third-party SDK calls (Supabase, Gemini, Inngest) so a hung
 * upstream never burns the full Vercel function timeout. supabase-js in
 * particular has internal retry logic that can swallow AbortSignal-driven
 * timeouts and retry until exhaustion — Promise.race sidesteps that entirely.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
