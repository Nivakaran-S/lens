import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileSearch,
  FileText,
  Gavel,
  Lock,
  Quote,
  Receipt,
  ShieldCheck,
  Sparkles,
  Timer,
  Upload,
  Zap,
} from 'lucide-react';

const READS = [
  { name: 'Title register & plan', detail: 'Official Copies, registered charges, restrictions' },
  { name: 'Local authority searches', detail: 'CON29, LLC1, planning history' },
  { name: 'TA6 & TA10', detail: 'Seller property and contents disclosures' },
  { name: 'EPC', detail: 'Energy rating, MEES exposure for lettings' },
  { name: 'Special conditions', detail: 'Auction pack addenda, fees, completion terms' },
  { name: 'Leases & tenancy docs', detail: 'Where applicable — ground rent, service charges, term' },
];

const SURFACES = [
  {
    icon: ShieldCheck,
    title: 'Restrictive covenants',
    body: 'Use restrictions, alteration consents, and indemnity insurance flags pulled straight from the title.',
  },
  {
    icon: AlertTriangle,
    title: 'MEES & EPC risk',
    body: 'Sub-E rated stock that you cannot legally let after April 2028 without exemption.',
  },
  {
    icon: Gavel,
    title: 'Executor & ownership mismatches',
    body: 'Vendor named on the contract does not match the registered proprietor or grant of probate.',
  },
  {
    icon: Receipt,
    title: 'Hidden auction fees',
    body: 'Buyer premium, contribution to seller costs, completion timeframes, reservation fees.',
  },
  {
    icon: Lock,
    title: 'Charges & insolvency',
    body: 'Outstanding mortgages, bankruptcy entries, Form A restrictions you must clear at completion.',
  },
  {
    icon: FileSearch,
    title: 'Search red flags',
    body: 'Enforcement notices, S106 obligations, road-adoption gaps, contaminated-land entries.',
  },
];

const STEPS = [
  {
    icon: Upload,
    title: 'Drop the ZIP',
    body: 'Download the pack from the auctioneer (EIG, Allsop, Auction House, SDL, Pugh, BidX1) and upload it as-is.',
  },
  {
    icon: Sparkles,
    title: 'Lens reads everything',
    body: 'PDFs, scans, and forms classified and analysed in a single pass — no hand-sorting.',
  },
  {
    icon: FileText,
    title: 'Get a triage report',
    body: 'Risks ranked, plain-English summary, and every finding cited back to the source page.',
  },
];

const FAQS = [
  {
    q: 'How accurate is it?',
    a: 'Lens is a triage tool, not a substitute for a conveyancer. It catches the obvious red flags fast so your solicitor can spend their time on the substantive issues. Every finding is cited to the source document — verify before bidding.',
  },
  {
    q: 'What does it cost?',
    a: 'New accounts get 10 free analyses. After that, top up with credit packs from £9.99. One credit covers one full pack. Failed analyses are refunded automatically.',
  },
  {
    q: 'Which auction packs work?',
    a: 'Any standard UK residential or commercial pack as a single ZIP. Lens has been tuned on packs from EIG, Allsop, Auction House, SDL, Pugh, and BidX1.',
  },
  {
    q: 'Is my data safe?',
    a: 'Packs are stored encrypted, accessed only by your account, and never used to train third-party models. Delete an analysis from your dashboard at any time.',
  },
  {
    q: 'Will it replace my solicitor?',
    a: 'No. Lens gives you a 3-minute view to decide which lots are worth a deeper legal review — and which to skip before paying for one.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-base font-semibold tracking-tight">Lens</span>
          <nav className="flex items-center gap-1 sm:gap-3 text-sm">
            <a href="#features" className="hidden px-2 py-1 text-zinc-600 hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-zinc-100">
              Features
            </a>
            <a href="#how-it-works" className="hidden px-2 py-1 text-zinc-600 hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-zinc-100">
              How it works
            </a>
            <a href="#pricing" className="hidden px-2 py-1 text-zinc-600 hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-zinc-100">
              Pricing
            </a>
            <a href="#faq" className="hidden px-2 py-1 text-zinc-600 hover:text-zinc-900 sm:inline dark:text-zinc-400 dark:hover:text-zinc-100">
              FAQ
            </a>
            <Link href="/sign-in" className="px-2 py-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 py-20 sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(244,114,182,0.08),transparent_60%),radial-gradient(40%_40%_at_80%_30%,rgba(99,102,241,0.08),transparent_60%)]"
          />
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              UK auction legal-pack triage
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Triage an auction legal pack in three minutes.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
              Drop the ZIP. Lens reads the title, searches, TA6/TA10, EPC, and special conditions —
              then surfaces restrictive covenants, MEES risk, executor mismatches, and other red
              flags with citations to the source documents.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Analyse a pack <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" /> 10 free analyses</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" /> No card required</span>
              <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" /> Refunded on failure</span>
            </p>
          </div>

          {/* Stat strip */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-4 text-center sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-2xl font-semibold tabular-nums">~3 min</div>
              <div className="mt-1 text-xs text-zinc-500">Average pack triage</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-2xl font-semibold tabular-nums">100+</div>
              <div className="mt-1 text-xs text-zinc-500">Pages of PDF per pack</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="text-2xl font-semibold tabular-nums">£1</div>
              <div className="mt-1 text-xs text-zinc-500">Per analysis after free credits</div>
            </div>
          </div>
        </section>

        {/* What it reads + What it surfaces */}
        <section id="features" className="border-t border-zinc-200 bg-zinc-50/60 px-6 py-20 dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Built for the way auction packs actually arrive.
              </h2>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                Hundreds of pages, mixed scans, inconsistent file names. Lens classifies each
                document, extracts the parts that matter, and joins them up.
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-base font-semibold">What Lens reads</h3>
                </div>
                <ul className="mt-4 space-y-3">
                  {READS.map((r) => (
                    <li key={r.name} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-zinc-500">{r.detail}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <h3 className="text-base font-semibold">What it surfaces</h3>
                </div>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {SURFACES.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                        <div className="text-sm font-medium">{title}</div>
                      </div>
                      <p className="mt-1.5 text-xs text-zinc-500">{body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three steps. No hand-sorting.</h2>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                You upload exactly what the auctioneer sends you. Lens does the rest.
              </p>
            </div>

            <ol className="mt-12 grid gap-6 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="relative rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {i + 1}
                    </div>
                    <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-zinc-500">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing teaser */}
        <section id="pricing" className="border-t border-zinc-200 bg-zinc-50/60 px-6 py-20 dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pay only for what you analyse.</h2>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                Buy credits in packs. One credit = one full analysis. Unused credits never expire.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Free</span>
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums">£0</div>
                <div className="mt-1 text-xs text-zinc-500">10 analyses on signup</div>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Full reports</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> No card required</li>
                </ul>
              </div>

              <div className="relative rounded-xl border-2 border-zinc-900 bg-white p-6 dark:border-zinc-100 dark:bg-zinc-950">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900 px-3 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                  Most popular
                </span>
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Top-up</span>
                </div>
                <div className="mt-3 text-3xl font-semibold tabular-nums">From £1</div>
                <div className="mt-1 text-xs text-zinc-500">Per analysis, in packs</div>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Buy in 10s, 50s, 100s</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Refunded on failure</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Credits never expire</li>
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Volume</span>
                </div>
                <div className="mt-3 text-3xl font-semibold">Talk to us</div>
                <div className="mt-1 text-xs text-zinc-500">Bulk packs for buying agents</div>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Custom volume pricing</li>
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600" /> Priority support</li>
                </ul>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Start with 10 free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Who uses Lens</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { title: 'Investors & landlords', body: 'Sift a Tuesday catalogue down to the lots worth a closer look before you waste a solicitor fee.' },
                { title: 'Buying agents', body: 'Brief clients on legal risk in plain English the same day a pack is released.' },
                { title: 'Solicitors', body: 'A faster first pass — focus your billable hours on the genuinely complex packs, not triage.' },
              ].map((c) => (
                <div key={c.title} className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                  <Quote className="h-5 w-5 text-zinc-400" />
                  <h3 className="mt-3 text-base font-semibold">{c.title}</h3>
                  <p className="mt-1.5 text-sm text-zinc-500">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-zinc-200 bg-zinc-50/60 px-6 py-20 dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Frequently asked</h2>
            <div className="mt-10 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
              {FAQS.map((f) => (
                <details key={f.q} className="group p-5 open:bg-zinc-50/60 dark:open:bg-zinc-900/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                    {f.q}
                    <span className="ml-4 text-zinc-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-10 text-center dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900">
            <Timer className="mx-auto h-6 w-6 text-zinc-500" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Your next auction is on Tuesday.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
              Sign up, drop the first pack, get a triage report before lunch. 10 free analyses to
              try it on real lots.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Get started free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              Informational summary only — not legal advice. Always commission a full review by a
              qualified conveyancer before bidding.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-10 text-sm text-zinc-500 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Lens</div>
            <div className="mt-1 text-xs">UK auction legal-pack triage. Built for speed.</div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <a href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-200">Features</a>
            <a href="#how-it-works" className="hover:text-zinc-900 dark:hover:text-zinc-200">How it works</a>
            <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-200">Pricing</a>
            <a href="#faq" className="hover:text-zinc-900 dark:hover:text-zinc-200">FAQ</a>
            <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-200">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-200">Terms</Link>
            <Link href="/sign-in" className="hover:text-zinc-900 dark:hover:text-zinc-200">Sign in</Link>
            <Link href="/sign-up" className="hover:text-zinc-900 dark:hover:text-zinc-200">Sign up</Link>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl text-xs text-zinc-400">
          © {new Date().getFullYear()} Lens. Lens is an informational triage tool and does not provide legal advice. We use Google Gemini AI to analyse uploaded documents.
        </div>
      </footer>
    </div>
  );
}
