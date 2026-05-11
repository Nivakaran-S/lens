import { z } from 'zod';

const schema = z.object({
  // Database (MariaDB/MySQL via mysql2). URL-encode special chars in the
  // password (e.g. `#` → `%23`).
  DATABASE_URL: z.string().url(),

  // ── Self-hosted auth — SMTP for verification + reset emails ─────────
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().email(),
  SMTP_FROM_NAME: z.string().default('Lens'),

  // Session cookie config — used to decide whether to mark cookies Secure.
  // In production this should be 'true' so cookies are HTTPS-only.
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((s) => s.toLowerCase() === 'true'),
  // Cookie Domain attribute. Set to '.checkmylegals.co.uk' so the session
  // cookie issued by api.checkmylegals.co.uk is also readable by the
  // apex frontend at checkmylegals.co.uk. Leave empty for localhost dev.
  COOKIE_DOMAIN: z.string().default(''),

  // Local filesystem storage — replaces Cloudflare R2.
  // Files live at {UPLOAD_DIR}/{userId}/{jobId}/{filename} and
  // {UPLOAD_DIR}/{userId}/{jobId}/docs/{idx}-{filename}.pdf
  UPLOAD_DIR: z.string().min(1),
  // HMAC secret for signing short-lived download URLs. Generate with
  // `openssl rand -hex 32`. Never expose to the client.
  FILE_SIGN_SECRET: z.string().min(32),
  FILE_SIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Public origin used to compose absolute download URLs (the worker has
  // no request context to derive this from). e.g. https://api.example.com
  PUBLIC_API_URL: z.string().url(),

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

  // Frontend URL — used for Stripe success/cancel redirects + email links.
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // GDPR retention for analysed jobs. Files + DB rows for any job in a
  // terminal state (done / failed) are deleted after this many days. Set
  // to 0 to disable the sweep (NOT recommended in production).
  RETENTION_DAYS_JOBS: z
    .string()
    .default('90')
    .transform((s) => Math.max(0, parseInt(s, 10) || 0)),

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
  'DATABASE_URL',
  'UPLOAD_DIR',
  'FILE_SIGN_SECRET',
  'PUBLIC_API_URL',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;
const OPTIONAL_KEYS = [
  'SMTP_PORT',
  'SMTP_FROM_NAME',
  'COOKIE_SECURE',
  'FILE_SIGN_TTL_SECONDS',
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
