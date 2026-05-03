import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { PUBLIC_ENV } from '../env';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(PUBLIC_ENV.SUPABASE_URL, PUBLIC_ENV.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies — handled by proxy.ts on auth flows.
        }
      },
    },
  });
}
