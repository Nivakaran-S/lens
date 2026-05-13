'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import { useUserProfile } from '../../../lib/useUserProfile';

export default function SettingsPage() {
  const router = useRouter();
  const { profile } = useUserProfile();
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function deleteAccount() {
    setError(null);
    startTransition(async () => {
      try {
        await api.deleteAccount();
        router.replace('/');
        router.refresh();
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Deletion failed';
        setError(msg);
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account & data</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your data under UK GDPR. Questions? Email{' '}
          <a href="mailto:contact@checkmylegals.co.uk" className="underline">
            contact@checkmylegals.co.uk
          </a>
          .
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Profile</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <dt className="text-zinc-500">Email</dt>
          <dd className="col-span-2 font-mono">{profile?.email ?? '—'}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd className="col-span-2">{profile?.role ?? '—'}</dd>
          <dt className="text-zinc-500">Credits</dt>
          <dd className="col-span-2 font-mono">{profile?.credits ?? '—'}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-base font-semibold">Download your data</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Right to data portability (Art 20). Downloads a JSON file containing your account,
          uploaded job metadata, analysis reports, and payment history. The uploaded ZIPs and
          extracted PDFs are not included in the export — those are deleted automatically after
          our retention period.
        </p>
        <a
          href={api.exportDataUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <Download className="h-4 w-4" />
          Download my data (JSON)
        </a>
      </section>

      <section className="rounded-lg border border-red-200 bg-red-50/30 p-5 dark:border-red-900 dark:bg-red-950/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-base font-semibold text-red-900 dark:text-red-200">
            Delete your account
          </h2>
        </div>
        <p className="mt-2 text-sm text-red-900/80 dark:text-red-200/80">
          Right to erasure (Art 17). This permanently:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900/80 dark:text-red-200/80">
          <li>Removes your email and password from our database</li>
          <li>Deletes every uploaded ZIP and extracted PDF</li>
          <li>Deletes every analysis report and job record</li>
          <li>Signs you out of every device</li>
        </ul>
        <p className="mt-2 text-sm text-red-900/80 dark:text-red-200/80">
          We keep an anonymised audit log of payments for accounting and anti-fraud purposes.
          This cannot be undone.
        </p>

        <div className="mt-4">
          <label className="block text-sm font-medium text-red-900 dark:text-red-200">
            Type <span className="font-mono">DELETE</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-md border border-red-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-red-600 dark:border-red-800 dark:bg-zinc-950"
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

        <button
          onClick={deleteAccount}
          disabled={confirmText !== 'DELETE' || pending}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {pending ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </section>
    </div>
  );
}
