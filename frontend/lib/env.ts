// Each access must use the full literal `process.env.NEXT_PUBLIC_FOO`
// so Next.js's static analyzer inlines it into the browser bundle.
// Dynamic access (`process.env[name]`) is silently stripped — do NOT use it here.
function ensure(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const PUBLIC_ENV = {
  SUPABASE_URL: ensure('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: ensure('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  // Optional — billing UI throws a friendly error if it's missing rather
  // than crashing the whole app at import time.
  STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
};
