import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Check My Legals',
  description: 'The rules of using Check My Legals.',
};

const LAST_UPDATED = '11 May 2026';
const CONTACT_EMAIL = 'contact@checkmylegals.co.uk';

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <Link href="/" className="text-xs text-zinc-500 underline">
        ← Back to home
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Terms of Service
      </h1>
      <p className="mt-2 text-xs text-zinc-500">Last updated: {LAST_UPDATED}</p>

      <p className="mt-6">
        These terms govern your use of Check My Legals (&quot;the Service&quot;), provided at{' '}
        <a href="https://checkmylegals.co.uk" className="underline">
          checkmylegals.co.uk
        </a>
        . By creating an account or using the Service you agree to them.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        1. What Check My Legals is — and isn&apos;t
      </h2>
      <p className="mt-2">
        Check My Legals is an automated <strong>triage tool</strong> for UK auction legal packs. It surfaces
        common risks for buyers to review with their conveyancer. The output is{' '}
        <strong>informational only</strong>:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>It is <strong>not legal advice</strong></li>
        <li>It is <strong>not a substitute for a qualified conveyancer or solicitor</strong></li>
        <li>It may contain errors or miss findings; AI-generated content is probabilistic</li>
        <li>You must independently verify every finding before relying on it to bid or buy</li>
      </ul>
      <p className="mt-2">
        Always commission a full legal review by a qualified solicitor before bidding on or
        purchasing a property.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        2. Eligibility
      </h2>
      <p className="mt-2">
        You must be at least 18 years old and able to enter a contract under the law of the
        jurisdiction you reside in. The Service is targeted at UK property professionals and
        investors.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        3. Your account
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>You&apos;re responsible for everything done under your account</li>
        <li>Keep your password secret; if you suspect a breach, reset it immediately</li>
        <li>One account per person; don&apos;t share accounts</li>
        <li>We can suspend or terminate accounts that breach these terms or are used abusively</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        4. Credits, payments, refunds
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Each pack analysis costs 1 credit</li>
        <li>New accounts receive a number of free credits as a trial</li>
        <li>Additional credits can be purchased in packs via Stripe. Prices are in GBP unless stated</li>
        <li>
          <strong>Failed analyses are refunded automatically:</strong> if our system can&apos;t
          complete an analysis, the credit charged for it is restored to your balance
        </li>
        <li>Successful analyses are non-refundable</li>
        <li>Credits do not expire while your account is active</li>
        <li>
          UK consumers have a 14-day right to cancel digital purchases under the Consumer
          Contracts Regulations — except where you&apos;ve consumed the digital service (run an
          analysis), in which case that consent waives the cancellation right for the consumed
          portion
        </li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        5. Acceptable use
      </h2>
      <p className="mt-2">You agree not to:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Upload content you don&apos;t have the right to share</li>
        <li>Reverse engineer, scrape, or attempt to extract our prompts or model outputs at scale</li>
        <li>Use the Service to harass, defame, or harm anyone</li>
        <li>Probe, scan, or attack our infrastructure</li>
        <li>Resell the Service or its output without written permission</li>
      </ul>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        6. AI processing
      </h2>
      <p className="mt-2">
        We use Google&apos;s Gemini API to analyse your documents. By uploading you authorise this
        processing. See the{' '}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>{' '}
        for details on data flow.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        7. Intellectual property
      </h2>
      <p className="mt-2">
        You retain ownership of the documents you upload. You grant us a non-exclusive licence to
        process them for the purpose of providing the Service. We own the Service itself,
        including the report formats, prompts, and software.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        8. Limitation of liability
      </h2>
      <p className="mt-2">
        Nothing in these terms limits our liability for death or personal injury caused by
        negligence, fraud, or anything else we cannot lawfully exclude.
      </p>
      <p className="mt-2">
        Subject to that: our total liability under or in connection with these terms is capped at
        the greater of (a) £100 or (b) the total fees you paid us in the 12 months preceding the
        event giving rise to the claim. We are not liable for indirect or consequential losses
        (lost profits, lost opportunity, business interruption, etc.).
      </p>
      <p className="mt-2">
        <strong>
          Because Check My Legals is informational and not legal advice, you bear sole responsibility for
          any bidding, purchase, or commercial decision you make.
        </strong>
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        9. Termination
      </h2>
      <p className="mt-2">
        You can delete your account at any time via{' '}
        <Link href="/settings" className="underline">
          Account &amp; data
        </Link>
        . We can suspend or terminate accounts that breach these terms; we&apos;ll usually warn
        first where practical.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        10. Changes
      </h2>
      <p className="mt-2">
        We may update these terms. Material changes will be notified to active accounts by email
        and shown on this page. Continued use after notice means you accept the updated terms.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        11. Governing law
      </h2>
      <p className="mt-2">
        These terms are governed by the laws of England and Wales. Disputes are subject to the
        exclusive jurisdiction of the courts of England and Wales, except that consumers retain
        any non-waivable rights under their local law.
      </p>

      <h2 className="mt-10 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        12. Contact
      </h2>
      <p className="mt-2">
        Questions:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </article>
  );
}
