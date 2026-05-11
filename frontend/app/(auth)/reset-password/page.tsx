'use client';

import { Suspense, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '../../../lib/api';

function ResetInner() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Missing reset token in URL.');
      return;
    }
    startTransition(async () => {
      try {
        await api.resetPassword(token, password);
        setSuccess(true);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Reset failed';
        setError(msg);
      }
    });
  }

  if (success) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
        <p className="mt-2 text-sm text-zinc-500">Sign in with your new password.</p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 text-sm text-zinc-500">At least 8 characters.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}
