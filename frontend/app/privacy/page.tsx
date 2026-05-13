import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Check My Legals',
  description: 'How Check My Legals collects, uses, and protects your personal data under UK GDPR.',
};

const CONTROLLER_EMAIL = 'contact@checkmylegals.co.uk';
const LAST_UPDATED = '11 May 2026';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <Link href="/" className="text-xs text-zinc-500 underline">
        ← Back to home
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6">
        This policy explains how Check My Legals (&quot;we&quot;, &quot;us&quot;) collects, uses, and protects your personal
        data when you use{' '}
        <a href="https://checkmylegals.co.uk" className="underline">
          checkmylegals.co.uk
        </a>
        . We are a UK-based controller of personal data under the UK GDPR and the Data Protection
        Act 2018.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        1. Who is the controller
      </h2>
      <p className="mt-2">
        Contact for all data protection requests:{' '}
        <a href={`mailto:${CONTROLLER_EMAIL}`} className="underline">
          {CONTROLLER_EMAIL}
        </a>
        . If you believe we&apos;ve mishandled your data you have the right to complain to the UK
        Information Commissioner&apos;s Office (ICO) at{' '}
        <a href="https://ico.org.uk" className="underline">
          ico.org.uk
        </a>
        .
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        2. What data we collect
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Account data:</strong> email address (used as your sign-in identifier) and a
          one-way hashed password.
        </li>
        <li>
          <strong>Session data:</strong> a strictly-necessary session cookie used to keep you
          signed in. No analytics or marketing cookies.
        </li>
        <li>
          <strong>Uploaded auction packs:</strong> the ZIP files you upload and the PDFs we
          extract from them. These typically contain third-party personal data (vendor names,
          registered proprietors, executor names, property addresses).
        </li>
        <li>
          <strong>Analysis reports:</strong> the structured output our system produces from each
          pack, stored against your account.
        </li>
        <li>
          <strong>Payment history:</strong> an audit log of credit purchases (amount, Stripe
          payment-intent id, date). Card details are processed by Stripe and never touch our
          servers.
        </li>
        <li>
          <strong>Technical logs:</strong> server logs may contain your IP address and rough
          request times for security and debugging.
        </li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        3. Why we process it and the legal basis
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>To deliver the service:</strong> processing necessary for performance of the
          contract you accept by signing up. Includes running analyses, storing reports, sending
          you verification + password-reset emails, charging via Stripe.
        </li>
        <li>
          <strong>Security and anti-fraud:</strong> legitimate interest in detecting abuse and
          keeping the platform secure. Includes the payment audit log we retain after account
          deletion.
        </li>
        <li>
          <strong>Compliance:</strong> we may retain certain records to meet statutory obligations
          (e.g. accounting records).
        </li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        4. AI processing
      </h2>
      <p className="mt-2">
        To produce the report we send the contents of your uploaded documents to Google&apos;s
        Gemini API, which performs the analysis. The Gemini API is operated by Google LLC in the
        United States. Google&apos;s data processing terms are available at{' '}
        <a href="https://cloud.google.com/terms/data-processing-addendum" className="underline">
          cloud.google.com/terms/data-processing-addendum
        </a>
        . The output is informational only — it is <em>not</em> legal advice and is not a sole
        automated decision under Art 22 UK GDPR.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        5. Who we share data with
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Google (Gemini API)</strong> — for AI analysis of uploaded documents. US-based.
        </li>
        <li>
          <strong>Stripe</strong> — for payment processing. Stripe is the controller for card
          data. <a href="https://stripe.com/privacy" className="underline">stripe.com/privacy</a>.
        </li>
        <li>
          <strong>Our hosting provider</strong> — Plesk VPS within the EU.
        </li>
      </ul>
      <p className="mt-2">
        International transfers to Google in the US are made under the EU/UK Standard Contractual
        Clauses.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        6. How long we keep it
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>Uploaded ZIPs and extracted PDFs:</strong> deleted automatically 90 days after
          analysis completes (or fails). You can delete them sooner by deleting your account.
        </li>
        <li>
          <strong>Analysis reports:</strong> kept while your account is active.
        </li>
        <li>
          <strong>Payment audit:</strong> retained 7 years for accounting purposes. After account
          deletion the user-identifying fields are anonymised; only transaction metadata remains.
        </li>
        <li>
          <strong>Server logs:</strong> rotated and deleted after 30 days.
        </li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        7. Your rights
      </h2>
      <p className="mt-2">Under UK GDPR you have the right to:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Access the personal data we hold about you (Art 15)</li>
        <li>Rectify inaccurate data (Art 16)</li>
        <li>Erasure / right to be forgotten (Art 17)</li>
        <li>Restrict or object to processing (Art 18 / 21)</li>
        <li>Data portability (Art 20)</li>
        <li>Withdraw any consent you&apos;ve given</li>
        <li>Lodge a complaint with the ICO</li>
      </ul>
      <p className="mt-2">
        You can exercise the access, portability, and erasure rights yourself via the{' '}
        <Link href="/settings" className="underline">
          Account &amp; data
        </Link>{' '}
        page once signed in. For anything else, email{' '}
        <a href={`mailto:${CONTROLLER_EMAIL}`} className="underline">
          {CONTROLLER_EMAIL}
        </a>{' '}
        and we&apos;ll respond within one month.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        8. Cookies
      </h2>
      <p className="mt-2">
        We use one strictly-necessary cookie: <code>lens_sid</code>, an opaque session token that
        keeps you signed in. It is HttpOnly, Secure, SameSite=Lax, and expires after 30 days.
        Strictly necessary cookies do not require consent under the Privacy and Electronic
        Communications Regulations (PECR). We do not use analytics or marketing cookies.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        9. Security
      </h2>
      <p className="mt-2">
        Passwords are stored as argon2id hashes; we never see your plaintext password. All
        traffic is HTTPS-only. Uploaded files are not directly web-served — they are accessible
        only via short-lived signed URLs scoped to your account. We periodically review access
        logs and apply security patches.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        10. Changes to this policy
      </h2>
      <p className="mt-2">
        We may update this policy. Material changes will be notified to active accounts by email.
        The &quot;Last updated&quot; date at the top reflects the most recent revision.
      </p>

      <hr className="mt-12 border-zinc-200 dark:border-zinc-800" />
      <p className="mt-6 text-xs text-zinc-500">
        Check My Legals is an informational triage tool and does not provide legal advice. Always commission
        a full review by a qualified conveyancer before bidding on a property.
      </p>
    </article>
  );
}
