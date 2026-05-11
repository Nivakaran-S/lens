import { createPool, type Pool } from 'mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { env } from '../env.js';
import { logger } from '../util/log.js';
import * as schema from './schema.js';

const log = logger('mariadb');

let cachedPool: Pool | null = null;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

const CONNECT_TIMEOUT_MS = 8_000;

function getPool(): Pool {
  if (cachedPool) return cachedPool;
  const url = env().DATABASE_URL;
  // Mask the password segment for safe logging.
  const safe = url.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
  log.info('connect: opening', { url: safe });
  cachedPool = createPool({
    uri: url,
    connectionLimit: 10,
    connectTimeout: CONNECT_TIMEOUT_MS,
    waitForConnections: true,
    // Return dates as ISO strings so calling code (which uses string
    // timestamps everywhere) doesn't see Date objects unexpectedly.
    dateStrings: true,
    timezone: 'Z',
  });
  return cachedPool;
}

export function pool(): Pool {
  return getPool();
}

export function db(): ReturnType<typeof drizzle<typeof schema>> {
  if (cachedDb) return cachedDb;
  // Drizzle accepts the callback-API Pool; it auto-wraps with .promise()
  // internally. mode:'default' = plain MySQL/MariaDB (vs 'planetscale').
  cachedDb = drizzle(getPool(), { schema, mode: 'default' });
  return cachedDb;
}

/** Cheap connectivity probe used by the diag endpoint. */
export async function ping(): Promise<void> {
  const t0 = Date.now();
  // Use the promise-wrapped pool so we can await.
  await getPool().promise().query('SELECT 1');
  log.info(`ping ok in ${Date.now() - t0}ms`);
}

/**
 * Tag a mysql2 error as a duplicate-entry on a specific unique index.
 * MariaDB/MySQL returns code 'ER_DUP_ENTRY' / errno 1062 for unique
 * violations and embeds the index name in the message. Used by the
 * Stripe webhook for idempotency.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; errno?: number; message?: string };
  const isDup = e.code === 'ER_DUP_ENTRY' || e.errno === 1062;
  if (!isDup) return false;
  if (!constraint) return true;
  // Format: "Duplicate entry '...' for key 'index_name'"
  return typeof e.message === 'string' && e.message.includes(`'${constraint}'`);
}
