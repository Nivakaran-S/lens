import { supabaseAdmin, type ChatMessageRow, type DocumentRow, type JobRow, type JobStatus } from './supabase.js';

type JobInsert = {
  user_id: string;
  zip_storage_path: string;
  zip_filename: string;
  zip_size_bytes?: number | null;
  property_label?: string | null;
  status?: JobStatus;
};

type JobUpdate = Partial<{
  zip_storage_path: string;
  property_label: string | null;
  status: JobStatus;
  status_detail: string | null;
  report: unknown;
  error: string | null;
}>;

export async function insertJob(values: JobInsert): Promise<JobRow> {
  const { data, error } = await supabaseAdmin().from('jobs').insert(values).select().single();
  if (error || !data) throw error ?? new Error('Insert failed');
  return data as JobRow;
}

export async function updateJob(id: string, values: JobUpdate): Promise<void> {
  const { error } = await supabaseAdmin().from('jobs').update(values).eq('id', id);
  if (error) throw error;
}

export async function getJob(id: string): Promise<JobRow | null> {
  const { data, error } = await supabaseAdmin().from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

export async function listJobsForUser(userId: string, limit = 50): Promise<JobRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as JobRow[];
}

export async function listDocumentsForJob(jobId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('documents')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

export async function listChatMessages(jobId: string): Promise<ChatMessageRow[]> {
  const { data, error } = await supabaseAdmin()
    .from('chat_messages')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function insertChatMessage(jobId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('chat_messages')
    .insert({ job_id: jobId, role, content });
  if (error) throw error;
}

type DocumentInsert = {
  job_id: string;
  filename: string;
  storage_path: string;
  size_bytes?: number | null;
};

type DocumentUpdate = Partial<{
  gemini_file_uri: string | null;
  gemini_file_uploaded_at: string | null;
  doc_type: string | null;
  extraction: unknown;
}>;

export async function insertDocument(values: DocumentInsert): Promise<DocumentRow> {
  const { data, error } = await supabaseAdmin().from('documents').insert(values).select().single();
  if (error || !data) throw error ?? new Error('Document insert failed');
  return data as DocumentRow;
}

export async function updateDocument(id: string, values: DocumentUpdate): Promise<void> {
  const { error } = await supabaseAdmin().from('documents').update(values).eq('id', id);
  if (error) throw error;
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data, error } = await supabaseAdmin().from('documents').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as DocumentRow | null) ?? null;
}
