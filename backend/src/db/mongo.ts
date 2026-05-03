import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';
import { env } from '../env.js';

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

export type ChatMessageDoc = {
  id: string;
  job_id: string;
  role: 'user' | 'assistant';
  content: string;
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
  if (connecting) return connecting;

  connecting = (async () => {
    const e = env();
    const client = new MongoClient(e.MONGODB_URL, {
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: 20_000,
      maxPoolSize: 10,
    });
    await client.connect();
    const db = client.db(e.MONGODB_DB_NAME);
    cachedClient = client;
    cachedDb = db;
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

export async function chatMessagesCollection(): Promise<Collection<WithMongoId<ChatMessageDoc>>> {
  return (await mongo()).collection<WithMongoId<ChatMessageDoc>>('chat_messages');
}

let indexesEnsured = false;
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const jobs = await jobsCollection();
  const documents = await documentsCollection();
  const chats = await chatMessagesCollection();
  await Promise.all([
    jobs.createIndex({ id: 1 }, { unique: true }),
    jobs.createIndex({ user_id: 1, created_at: -1 }),
    documents.createIndex({ id: 1 }, { unique: true }),
    documents.createIndex({ job_id: 1, created_at: 1 }),
    chats.createIndex({ job_id: 1, created_at: 1 }),
  ]);
}

export type { JobDoc as JobRow, DocumentDoc as DocumentRow, ChatMessageDoc as ChatMessageRow };
