'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { api, ApiError } from '../../../lib/api';

type Stage = 'verifying' | 'success' | 'error';

function VerifyInner() {
  const search = useSearchParams();
  const token = search.get('token') ?? '';
  const [stage, setStage] = useState<Stage>('verifying');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStage('error');
      setMessage('Missing token in URL.');
      return;
    }
    let cancelled = false;
    api
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStage('success');
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message.replace(/^API \d+: /, '') : 'Verification failed';
        setMessage(msg);
        setStage('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="w-full max-w-sm text-center">
      {stage === 'verifying' && (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Verifying your email…</h1>
        </>
      )}
      {stage === 'success' && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Email verified</h1>
          <p className="mt-2 text-sm text-zinc-500">You can now sign in to your account.</p>
          <Link
            href="/sign-in"
            className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Sign in
          </Link>
        </>
      )}
      {stage === 'error' && (
        <>
          <XCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Verification failed</h1>
          <p className="mt-2 text-sm text-zinc-500">{message}</p>
          <Link
            href="/sign-up"
            className="mt-6 inline-block text-sm text-zinc-500 underline"
          >
            Sign up again
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
