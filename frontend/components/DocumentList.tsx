'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import type { JobDocument } from '../lib/types';

const DOC_TYPE_LABEL: Record<string, string> = {
  title_register: 'Title register',
  title_plan: 'Title plan',
  local_search: 'Local search',
  environmental_search: 'Environmental search',
  drainage_water_search: 'Drainage & water',
  epc: 'EPC',
  ta6_property_info: 'TA6 property info',
  ta10_fittings_contents: 'TA10 fittings & contents',
  historic_conveyance: 'Historic conveyance',
  grant_of_probate: 'Grant of probate',
  special_conditions: 'Special conditions',
  contents_list: 'Contents list',
  other: 'Other',
};

export function DocumentList({ jobId, documents }: { jobId: string; documents: JobDocument[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Documents in this pack</h2>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {documents.map((d) => (
          <DocumentRow key={d.id} jobId={jobId} doc={d} />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({ jobId, doc }: { jobId: string; doc: JobDocument }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasExtraction = doc.extraction != null && Object.keys(doc.extraction as object).length > 0;

  function viewPdf() {
    startTransition(async () => {
      try {
        const r = await api.getDocumentUrl(jobId, doc.id);
        window.open(r.url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('failed to get signed url', e);
      }
    });
  }

  return (
    <li>
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          disabled={!hasExtraction}
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${hasExtraction ? 'text-zinc-500' : 'text-zinc-300 dark:text-zinc-700'}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm">{doc.filename}</span>
        </button>
        <span className="whitespace-nowrap text-xs text-zinc-500">
          {doc.doc_type ? (DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type) : 'Pending…'}
        </span>
        <button
          onClick={viewPdf}
          disabled={pending}
          className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {pending ? 'Opening…' : 'View PDF'}
        </button>
      </div>
      {open && hasExtraction && (
        <pre className="border-t border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-700 overflow-x-auto dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
{JSON.stringify(doc.extraction, null, 2)}
        </pre>
      )}
    </li>
  );
}
