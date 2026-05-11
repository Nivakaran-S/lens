'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { api, ApiError } from '../../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        await api.forgotPassword(email);
        // Backend always returns ok regardless of whether the email exists
        // (anti-enumeration). Show a neutral message.
        setInfo(
          `If an account exists for ${email}, we just emailed a password-reset link. It expires in 1 hour.`,
        );
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Request failed';
        setError(msg);
      }
    });
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Enter the email you signed up with and we&apos;ll email you a reset link.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}

        <button
          type="submit"
          disabled={pending || Boolean(info)}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? 'Sending…' : info ? 'Sent' : 'Email me a reset link'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Remembered it?{' '}
        <Link href="/sign-in" className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </div>
  );
}
