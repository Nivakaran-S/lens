'use client';

import { use, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import type { JobDetail } from '../../../../lib/types';
import { JobStatusPill } from '../../../../components/JobStatusPill';
import { ReportView } from '../../../../components/ReportView';
import { DocumentList } from '../../../../components/DocumentList';

const TERMINAL = new Set(['done', 'failed']);
const POLL_MS = 2000;

export default function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const [data, setData] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const r = await api.getJob(jobId);
        if (cancelled) return;
        setData(r);
        if (!TERMINAL.has(r.job.status)) {
          timer = setTimeout(tick, POLL_MS);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load job');
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const { job, documents } = data;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {job.property_label ?? job.zip_filename}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Uploaded {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        <JobStatusPill status={job.status} detail={job.status_detail} />
      </header>

      {job.status === 'failed' && job.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {job.error}
        </div>
      )}

      {job.status !== 'done' && job.status !== 'failed' && (
        <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm font-medium">Working on it…</p>
          <p className="mt-1 text-xs text-zinc-500">
            {job.status_detail ?? 'This can take a couple of minutes for a full pack.'}
          </p>
        </div>
      )}

      {job.report && <ReportView report={job.report} />}

      {documents.length > 0 && <DocumentList jobId={jobId} documents={documents} />}
    </div>
  );
}
