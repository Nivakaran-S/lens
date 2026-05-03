/**
 * Wrap any promise with a hard deadline. If the promise doesn't resolve within
 * `ms` milliseconds, reject with a labelled TimeoutError.
 *
 * Used to bound third-party SDK calls so a hung upstream never burns the full
 * Vercel function timeout. Logs start/finish/timeout for visibility.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export type DeadlineLogger = {
  info: (msg: string) => void;
};

export function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  log?: DeadlineLogger,
): Promise<T> {
  const t0 = Date.now();
  log?.info(`[deadline:start] ${label} (limit=${ms}ms)`);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      log?.info(`[deadline:fired] ${label} (waited=${Date.now() - t0}ms, limit=${ms}ms)`);
      reject(new TimeoutError(label, ms));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        log?.info(`[deadline:ok] ${label} resolved in ${Date.now() - t0}ms`);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        log?.info(`[deadline:rejected] ${label} after ${Date.now() - t0}ms: ${e instanceof Error ? e.message : String(e)}`);
        reject(e);
      },
    );
  });
}
