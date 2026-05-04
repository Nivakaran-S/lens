import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import { env } from '../env.js';
import { logger } from '../util/log.js';

const log = logger('mongo');

export type JobStatus =
  | 'queued'
  | 'uploaded'
  | 'extracting'
  | 'classifying'
  | 'analyzing'
  | 'synthesizing'
  | 'done'
  | 'failed';

// API shape — what callers see and what gets persisted to Inngest step
// outputs. Never includes _id.
export type JobDoc = {
  id: string;
  user_id: string;
  zip_storage_key: string;
  zip_filename: string;
  zip_size_bytes: number | null;
  property_label: string | null;
  status: JobStatus;
  status_detail: string | null;
  report: unknown | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentDoc = {
  id: string;
  job_id: string;
  filename: string;
  storage_key: string;
  size_bytes: number | null;
  gemini_file_uri: string | null;
  gemini_file_uploaded_at: string | null;
  doc_type: string | null;
  extraction: unknown | null;
  created_at: string;
};

// Storage shape — what MongoDB sees, with the auto-generated _id.
type WithMongoId<T> = T & { _id?: ObjectId };

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let connecting: Promise<{ client: MongoClient; db: Db }> | null = null;

const CONNECT_TIMEOUT_MS = 8_000;

async function connect(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb };
  if (connecting) {
    log.info('connect: awaiting in-flight connection');
    return connecting;
  }

  connecting = (async () => {
    const t0 = Date.now();
    const e = env();
    // Mask password segment of the URL for safe logging
    const safeUrl = e.MONGODB_URL.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
    log.info(`connect: opening`, { url: safeUrl, db: e.MONGODB_DB_NAME });
    const client = new MongoClient(e.MONGODB_URL, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: 20_000,
      maxPoolSize: 10,
    });
    try {
      await client.connect();
    } catch (err) {
      log.error(`connect: failed after ${Date.now() - t0}ms`, {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      });
      throw err;
    }
    const db = client.db(e.MONGODB_DB_NAME);
    cachedClient = client;
    cachedDb = db;
    log.info(`connect: ready in ${Date.now() - t0}ms`);
    return { client, db };
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function mongo(): Promise<Db> {
  return (await connect()).db;
}

export async function jobsCollection(): Promise<Collection<WithMongoId<JobDoc>>> {
  return (await mongo()).collection<WithMongoId<JobDoc>>('jobs');
}

export async function documentsCollection(): Promise<Collection<WithMongoId<DocumentDoc>>> {
  return (await mongo()).collection<WithMongoId<DocumentDoc>>('documents');
}

let indexesEnsured = false;
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const t0 = Date.now();
  log.info('ensureIndexes: starting');
  try {
    const jobs = await jobsCollection();
    const documents = await documentsCollection();
    await Promise.all([
      jobs.createIndex({ id: 1 }, { unique: true }),
      jobs.createIndex({ user_id: 1, created_at: -1 }),
      documents.createIndex({ id: 1 }, { unique: true }),
      documents.createIndex({ job_id: 1, created_at: 1 }),
    ]);
    log.info(`ensureIndexes: done in ${Date.now() - t0}ms`);
  } catch (err) {
    indexesEnsured = false; // allow retry on next call
    log.error(`ensureIndexes: failed after ${Date.now() - t0}ms`, {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
}

export type { JobDoc as JobRow, DocumentDoc as DocumentRow };
