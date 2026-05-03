import type { JobStatus } from '../lib/types';

const STYLE: Record<JobStatus, string> = {
  queued: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  uploaded: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  extracting: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  classifying: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  analyzing: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  synthesizing: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

const LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  uploaded: 'Uploaded',
  extracting: 'Extracting',
  classifying: 'Classifying',
  analyzing: 'Analyzing',
  synthesizing: 'Synthesizing',
  done: 'Done',
  failed: 'Failed',
};

export function JobStatusPill({ status, detail }: { status: JobStatus; detail?: string | null }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className={`rounded-full px-2 py-0.5 font-medium ${STYLE[status]}`}>{LABEL[status]}</span>
      {detail && <span className="text-zinc-500">{detail}</span>}
    </span>
  );
}
