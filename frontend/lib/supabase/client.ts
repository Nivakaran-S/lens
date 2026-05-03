'use client';

import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_ENV } from '../env';

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(PUBLIC_ENV.SUPABASE_URL, PUBLIC_ENV.SUPABASE_ANON_KEY);
  return cached;
}
