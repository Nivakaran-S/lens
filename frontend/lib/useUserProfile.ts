'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import type { UserProfile } from './types';

/**
 * Tiny hook that fetches /api/me once on mount and exposes the profile.
 * `refresh()` re-fetches — call it after a Stripe checkout returns or when
 * an admin allocates credits, to update the AppHeader pill without a full
 * page reload.
 *
 * No global cache yet — each consumer fires its own fetch. Fine for our
 * scale; swap in SWR later if multiple components on the same page need
 * the profile and we want to dedupe.
 */
export function useUserProfile(): {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .me()
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { profile, loading, error, refresh: () => setTick((t) => t + 1) };
}
