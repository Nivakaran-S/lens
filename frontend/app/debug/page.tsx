'use client';

export const dynamic = 'force-dynamic';

export default function DebugPage() {
  const api = process.env.NEXT_PUBLIC_API_BASE_URL;
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const rows: { name: string; value: string; ok: boolean }[] = [
    {
      name: 'NEXT_PUBLIC_API_BASE_URL',
      value: api ?? '(missing)',
      ok: Boolean(api && api.startsWith('https://')),
    },
    {
      name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      value: pk ? `set — ${pk.length} chars, starts ${pk.slice(0, 12)}…` : '(missing)',
      ok: Boolean(pk && (pk.startsWith('pk_test_') || pk.startsWith('pk_live_'))),
    },
  ];

  const allOk = rows.every((r) => r.ok);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Lens — frontend debug</h1>
      <p className="mt-2 text-sm text-zinc-500">
        These are the <code>NEXT_PUBLIC_*</code> values that the deployed JS bundle in your browser
        actually received at build time. They&apos;re not secrets — Next.js inlines them into every
        bundle. Use this to confirm the env vars made it into the deploy.
      </p>

      <div
        className={`mt-6 rounded-md border p-3 text-sm font-medium ${
          allOk
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
            : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
        }`}
      >
        {allOk ? '✓ All public env vars look healthy.' : '✗ One or more env vars are missing or look wrong.'}
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
            <th className="py-2 pr-3 font-medium">Variable</th>
            <th className="py-2 pr-3 font-medium">Value (prefix)</th>
            <th className="py-2 pr-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-zinc-100 align-top dark:border-zinc-900">
              <td className="py-2.5 pr-3 font-mono text-[11px]">{r.name}</td>
              <td className="py-2.5 pr-3 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                {r.value}
              </td>
              <td className="py-2.5 pr-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    r.ok
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                  }`}
                >
                  {r.ok ? 'ok' : 'missing'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
