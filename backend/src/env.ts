import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  SUPABASE_JWT_AUD: z.string().default('authenticated'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

type Env = z.infer<typeof schema>;
let cached: Env | null = null;

/**
 * Strict env access — throws on first call if any required var is missing.
 * Routes that need env should call this; /api/health and /api/diag must NOT.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    const missing = Object.keys(fields).join(', ');
    const msg = `Missing or invalid env vars: ${missing}`;
    console.error('[env]', msg, fields);
    throw new Error(msg);
  }
  cached = parsed.data;
  return cached;
}

const REQUIRED_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const OPTIONAL_KEYS = [
  'SUPABASE_JWT_SECRET',
  'GEMINI_API_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'CORS_ORIGINS',
  'SUPABASE_JWT_AUD',
] as const;

/**
 * Diagnostic: never throws, never reveals values. Useful from /api/diag to
 * verify the deployed function is actually receiving the env vars the
 * dashboard claims to have set.
 */
export function envStatus(): {
  required: { name: string; present: boolean }[];
  optional: { name: string; present: boolean }[];
  allRequiredPresent: boolean;
} {
  const required = REQUIRED_KEYS.map((n) => ({ name: n, present: Boolean(process.env[n]) }));
  const optional = OPTIONAL_KEYS.map((n) => ({ name: n, present: Boolean(process.env[n]) }));
  return {
    required,
    optional,
    allRequiredPresent: required.every((r) => r.present),
  };
}

/** CORS origin allowlist. Reads process.env directly so it's safe before env() validates. */
export function corsOrigins(): string[] {
  const v = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
  return v
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // strip trailing slashes
    .filter(Boolean);
}

/**
 * Whether a given Origin header value is in the allowlist.
 * Tolerant of trailing slashes. Set CORS_ORIGINS=* to allow ANY origin
 * (useful for short-lived debugging only — disables CORS protection).
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  const allow = corsOrigins();
  if (allow.includes('*')) return true;
  const normalised = origin.replace(/\/+$/, '');
  return allow.includes(normalised);
}
