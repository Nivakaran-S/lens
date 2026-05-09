'use client';

import { getSupabaseBrowser } from './supabase/client';
import { PUBLIC_ENV } from './env';
import type {
  AdminUser,
  CreateJobResponse,
  CreditPackage,
  JobDetail,
  JobSummary,
  UserProfile,
  UserRole,
} from './types';

/**
 * Surfaced as `error.status` on caught ApiError instances so callers can
 * branch on specific responses (e.g. 402 → redirect to /billing).
 */
export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

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
    let message = res.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(res.status, text, `API ${res.status}: ${message}`);
  }
  // Some routes (DELETE) return 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Profile
  me: () => request<UserProfile>('/api/me'),

  // Jobs
  listJobs: () => request<{ jobs: JobSummary[] }>('/api/jobs'),
  createJob: (filename: string, sizeBytes: number) =>
    request<CreateJobResponse>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ filename, sizeBytes }),
    }),
  /**
   * Upload the ZIP for a job. Uses XMLHttpRequest so we get upload-progress
   * events — fetch() doesn't expose them on Safari/Firefox. The endpoint
   * is `${API_BASE}/api/jobs/<id>/upload`; back-end accepts either
   * multipart/form-data with field "file", or raw application/zip body.
   */
  uploadJobFile: (jobId: string, file: File, onProgress?: (pct: number) => void) =>
    new Promise<void>((resolve, reject) => {
      (async () => {
        const headers = await authHeaders();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${PUBLIC_ENV.API_BASE_URL}/api/jobs/${jobId}/upload`);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let message = xhr.statusText || `HTTP ${xhr.status}`;
            try {
              const parsed = JSON.parse(xhr.responseText) as { error?: string };
              if (parsed.error) message = parsed.error;
            } catch {
              if (xhr.responseText) message = xhr.responseText;
            }
            reject(new ApiError(xhr.status, xhr.responseText, `API ${xhr.status}: ${message}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        const fd = new FormData();
        fd.append('file', file);
        xhr.send(fd);
      })().catch(reject);
    }),
  startJob: (jobId: string) =>
    request<{ jobId: string; status: string }>(`/api/jobs/${jobId}/start`, { method: 'POST' }),
  getJob: (jobId: string) => request<JobDetail>(`/api/jobs/${jobId}`),
  getDocumentUrl: (jobId: string, docId: string) =>
    request<{ url: string; expiresInSeconds: number }>(
      `/api/jobs/${jobId}/documents/${docId}/url`,
    ),

  // Public credit packages (any signed-in user can list active ones)
  packages: () => request<{ packages: CreditPackage[] }>('/api/packages'),

  // Stripe — embedded checkout via PaymentIntent. The clientSecret is
  // consumed by Stripe Elements on /billing/checkout to render the form.
  createPaymentIntent: (packageId: string) =>
    request<{
      clientSecret: string;
      paymentIntentId: string;
      amount: number;
      currency: string;
      package: { id: string; name: string; credits: number; price_cents: number; currency: string };
    }>('/api/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    }),

  // Admin — users
  adminListUsers: (search?: string) =>
    request<{ users: AdminUser[] }>(
      `/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
    ),
  adminAllocateCredits: (userId: string, delta: number, note?: string) =>
    request<{ balance: number }>(`/api/admin/users/${userId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ delta, note }),
    }),
  adminSetRole: (userId: string, role: UserRole) =>
    request<{ ok: true }>(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  // Admin — packages
  adminListPackages: () =>
    request<{ packages: CreditPackage[] }>('/api/admin/packages'),
  adminCreatePackage: (data: { name: string; credits: number; price_cents: number; currency?: string; active?: boolean }) =>
    request<CreditPackage>('/api/admin/packages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  adminUpdatePackage: (id: string, data: Partial<{ name: string; credits: number; price_cents: number; currency: string; active: boolean }>) =>
    request<CreditPackage>(`/api/admin/packages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  adminDeletePackage: (id: string) =>
    request<void>(`/api/admin/packages/${id}`, { method: 'DELETE' }),
};
