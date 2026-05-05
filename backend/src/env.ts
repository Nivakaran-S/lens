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

  // Stripe (optional in dev — backend can boot without billing)
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CURRENCY: z.string().default('gbp'),

  // Roles + credits policy
  // Comma-separated emails that should be elevated to role=admin on first sign-in.
  ADMIN_EMAILS: z.string().default(''),
  // Free credits a brand-new user receives.
  INITIAL_FREE_CREDITS: z
    .string()
    .default('10')
    .transform((s) => Math.max(0, parseInt(s, 10) || 0)),
  // Credits charged per pack analysis. Refunded automatically if analysis fails.
  COST_PER_ANALYSIS: z
    .string()
    .default('1')
    .transform((s) => Math.max(0, parseInt(s, 10) || 1)),

  // Frontend URL — used for Stripe success/cancel redirects.
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

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
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CURRENCY',
  'ADMIN_EMAILS',
  'INITIAL_FREE_CREDITS',
  'COST_PER_ANALYSIS',
  'FRONTEND_URL',
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

/**
 * Returns the set of admin email addresses (lowercased, trimmed) from
 * ADMIN_EMAILS. Used at user-creation time to decide initial role.
 */
export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
