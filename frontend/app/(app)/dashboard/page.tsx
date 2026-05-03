'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { JobSummary } from '../../../lib/types';
import { JobStatusPill } from '../../../components/JobStatusPill';
import { OverallRiskBadge } from '../../../components/OverallRiskBadge';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listJobs()
      .then((r) => {
        if (!cancelled) setJobs(r.jobs);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your packs</h1>
          <p className="mt-1 text-sm text-zinc-500">Past and in-progress legal-pack analyses.</p>
        </div>
        <Link
          href="/upload"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Analyse a new pack
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {jobs === null && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {jobs && jobs.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">No packs yet.</p>
          <Link
            href="/upload"
            className="mt-3 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Upload your first pack
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{job.property_label ?? job.zip_filename}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {job.status === 'done' && job.overall_risk && (
                    <OverallRiskBadge risk={job.overall_risk} />
                  )}
                  <JobStatusPill status={job.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
