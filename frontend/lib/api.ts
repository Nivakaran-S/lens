'use client';

import { getSupabaseBrowser } from './supabase/client';
import { PUBLIC_ENV } from './env';
import type {
  CreateJobResponse,
  JobDetail,
  JobSummary,
} from './types';

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(await authHeaders())) headers.set(k, v);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${PUBLIC_ENV.API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listJobs: () => request<{ jobs: JobSummary[] }>('/api/jobs'),
  createJob: (filename: string, sizeBytes: number) =>
    request<CreateJobResponse>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ filename, sizeBytes }),
    }),
  startJob: (jobId: string) =>
    request<{ jobId: string; status: string }>(`/api/jobs/${jobId}/start`, { method: 'POST' }),
  getJob: (jobId: string) => request<JobDetail>(`/api/jobs/${jobId}`),
  getDocumentUrl: (jobId: string, docId: string) =>
    request<{ url: string; expiresInSeconds: number }>(
      `/api/jobs/${jobId}/documents/${docId}/url`,
    ),
};
