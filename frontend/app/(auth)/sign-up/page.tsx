'use client';

import { Suspense, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '../../../lib/api';

function SignUpForm() {
  const search = useSearchParams();
  const next = search.get('next') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailTaken(false);
    setInfo(null);
    if (!agreed) {
      setError('Please agree to the Privacy Policy and Terms of Service.');
      return;
    }
    startTransition(async () => {
      try {
        await api.signUp(email, password);
        setInfo(
          `Check your inbox at ${email} for a verification link, then come back and sign in.`,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setEmailTaken(true);
          return;
        }
        const msg = err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Sign-up failed';
        setError(msg);
      }
    });
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Create your Check My Legals account</h1>

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
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5"
          />
          <span>
            I agree to the{' '}
            <Link href="/privacy" target="_blank" className="underline">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/terms" target="_blank" className="underline">
              Terms of Service
            </Link>
            . I understand the analysis is informational and not legal advice.
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {emailTaken && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>An account already exists for <span className="font-medium">{email}</span>.</p>
            <p className="mt-1">
              <Link
                href={`/sign-in?next=${encodeURIComponent(next)}`}
                className="font-medium underline"
              >
                Sign in instead
              </Link>
              {' '}or{' '}
              <Link href="/forgot-password" className="font-medium underline">
                reset your password
              </Link>
              .
            </p>
          </div>
        )}
        {info && <p className="text-sm text-emerald-600">{info}</p>}

        <button
          type="submit"
          disabled={pending || Boolean(info) || !agreed}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? 'Creating account…' : info ? 'Sent' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        Already have an account?{' '}
        <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
