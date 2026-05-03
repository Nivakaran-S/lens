import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-base font-semibold tracking-tight">Lens</span>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/sign-in" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
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

      <main className="flex flex-1 items-center px-6">
        <div className="mx-auto max-w-3xl py-16">
          <span className="inline-block rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            UK property auctions
          </span>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Triage an auction legal pack in three minutes.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Drop the ZIP. Lens reads the title, searches, TA6/TA10, EPC, and special conditions —
            then surfaces restrictive covenants, MEES risk, executor mismatches, and other red flags
            with citations to the source documents.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Analyse a pack
            </Link>
            <Link
              href="/sign-in"
              className="rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-xs text-zinc-500">
            Informational summary only — not legal advice. Always commission a full review by a
            qualified conveyancer before bidding.
          </p>
        </div>
      </main>
    </div>
  );
}
