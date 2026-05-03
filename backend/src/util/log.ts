import { randomUUID } from 'node:crypto';
import { createMiddleware } from 'hono/factory';

/**
 * Structured logger with a stable request-id prefix.
 * Pulls the id from Hono context if available, falls back to a fresh uuid.
 *
 * Usage from a route:
 *   const log = c.get('log');
 *   log.info('something happened', { extra: 'data' });
 *
 * Usage from a non-route helper (no Hono context):
 *   import { logger } from './util/log.js';
 *   const l = logger('warmup');
 *   l.info('connecting to mongo');
 */

export type Logger = {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, extra?: Record<string, unknown>) => void;
  child: (suffix: string) => Logger;
  reqId: string;
};

function format(level: string, reqId: string, msg: string, extra?: Record<string, unknown>): string {
  const base = `[${level}] [${reqId}] ${msg}`;
  if (!extra) return base;
  try {
    return `${base} ${JSON.stringify(extra)}`;
  } catch {
    return base;
  }
}

export function logger(reqId: string = randomUUID().slice(0, 8)): Logger {
  return {
    info: (msg, extra) => console.log(format('info', reqId, msg, extra)),
    warn: (msg, extra) => console.warn(format('warn', reqId, msg, extra)),
    error: (msg, extra) => console.error(format('error', reqId, msg, extra)),
    child: (suffix: string) => logger(`${reqId}:${suffix}`),
    reqId,
  };
}

type LogEnv = { Variables: { log: Logger; reqStart: number } };

export const requestLogger = createMiddleware<LogEnv>(async (c, next) => {
  const reqId = c.req.header('x-request-id') ?? randomUUID().slice(0, 8);
  const log = logger(reqId);
  const start = Date.now();
  c.set('log', log);
  c.set('reqStart', start);

  log.info(`-> ${c.req.method} ${c.req.path}`);
  c.header('x-request-id', reqId);

  try {
    await next();
  } finally {
    const ms = Date.now() - start;
    log.info(`<- ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  }
});

export type { LogEnv };
