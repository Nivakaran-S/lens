import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import { logger } from '../util/log.js';
import * as schema from './schema.js';

const log = logger('pg');

let cachedPool: pg.Pool | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

const CONNECT_TIMEOUT_MS = 8_000;

function getPool(): pg.Pool {
  if (cachedPool) return cachedPool;
  const url = env().DATABASE_URL;
  // Mask the password segment for safe logging.
  const safe = url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
  log.info('connect: opening', { url: safe });
  cachedPool = new pg.Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: 'lens-api',
  });
  cachedPool.on('error', (err) => {
    log.error('pool error', { error: err.message });
  });
  return cachedPool;
}

export function pool(): pg.Pool {
  return getPool();
}

export function db(): ReturnType<typeof drizzle<typeof schema>> {
  if (cachedDb) return cachedDb;
  cachedDb = drizzle(getPool(), { schema });
  return cachedDb;
}

/** Cheap connectivity probe used by the diag endpoint. */
export async function ping(): Promise<void> {
  const t0 = Date.now();
  await getPool().query('SELECT 1');
  log.info(`ping ok in ${Date.now() - t0}ms`);
}

/**
 * Tag a Drizzle/pg error as a unique-violation on a specific constraint.
 * Postgres returns code '23505' as a string and exposes `constraint` on
 * the error object. Used by the Stripe webhook for idempotency.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23505') return false;
  if (constraint && e.constraint !== constraint) return false;
  return true;
}
