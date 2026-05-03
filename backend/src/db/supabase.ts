import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

export type JobRow = {
  id: string;
  user_id: string;
  zip_storage_path: string;
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

export type DocumentRow = {
  id: string;
  job_id: string;
  filename: string;
  storage_path: string;
  size_bytes: number | null;
  gemini_file_uri: string | null;
  gemini_file_uploaded_at: string | null;
  doc_type: string | null;
  extraction: unknown | null;
  created_at: string;
};

export type ChatMessageRow = {
  id: string;
  job_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const e = env();
  cached = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const STORAGE_BUCKET = 'legal-packs';

export function zipStoragePath(userId: string, jobId: string, filename: string): string {
  const safeName = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/${safeName}`;
}

export function docStoragePath(userId: string, jobId: string, index: number, filename: string): string {
  const safeName = filename.replace(/[^\w.\-]+/g, '_');
  return `${userId}/${jobId}/docs/${String(index).padStart(2, '0')}-${safeName}`;
}
