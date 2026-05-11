// Each access must use the full literal `process.env.NEXT_PUBLIC_FOO`
// so Next.js's static analyzer inlines it into the browser bundle.
// Dynamic access (`process.env[name]`) is silently stripped — do NOT use it here.
export const PUBLIC_ENV = {
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787',
  // Stripe publishable key — used by the embedded <PaymentElement> on
  // /billing/checkout. Optional at module load; the billing UI throws a
  // friendly error if it's missing rather than crashing the whole app.
  STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
};
