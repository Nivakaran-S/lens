import { z } from 'zod';

const schema = z.object({
  // Supabase Auth (JWT-only, no SDK calls from backend)
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  SUPABASE_JWT_AUD: z.string().default('authenticated'),

  // MongoDB
  MONGODB_URL: z.string().min(1),
  MONGODB_DB_NAME: z.string().default('lens'),

  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().default('lens-packs'),

  // Gemini
  GEMINI_API_KEY: z.string().min(1).optional(),

  // Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

type Env = z.infer<typeof schema>;
let cached: Env | null = null;

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

const REQUIRED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'MONGODB_URL',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;
const OPTIONAL_KEYS = [
  'SUPABASE_JWT_SECRET',
  'SUPABASE_JWT_AUD',
  'MONGODB_DB_NAME',
  'R2_BUCKET',
  'GEMINI_API_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'CORS_ORIGINS',
] as const;

export function envStatus() {
  const required = REQUIRED_KEYS.map((n) => ({ name: n, present: Boolean(process.env[n]) }));
  const optional = OPTIONAL_KEYS.map((n) => ({ name: n, present: Boolean(process.env[n]) }));
  return {
    required,
    optional,
    allRequiredPresent: required.every((r) => r.present),
  };
}

export function corsOrigins(): string[] {
  const v = process.env.CORS_ORIGINS ?? 'http://localhost:3000';
  return v
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  const allow = corsOrigins();
  if (allow.includes('*')) return true;
  const normalised = origin.replace(/\/+$/, '');
  return allow.includes(normalised);
}
