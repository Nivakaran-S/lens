'use client';

import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '../../../lib/api';

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await api.signIn(email, password);
        router.replace(next);
        router.refresh();
      } catch (err) {
        const msg = err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Sign-in failed';
        setError(msg);
      }
    });
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Lens</h1>
      <p className="mt-1 text-sm text-zinc-500">UK auction legal-pack analysis.</p>

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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <Link
            href="/forgot-password"
            className="mt-1 inline-block text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Forgot your password?
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-500">
        No account?{' '}
        <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="font-medium text-zinc-900 underline dark:text-zinc-100">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
