import { FileText } from 'lucide-react';
import type { HeadlineFinding, SynthesisReport } from '../lib/types';
import { RiskCard } from './RiskCard';

const OVERALL_STYLE: Record<SynthesisReport['overall_risk'], string> = {
  low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

function isObjectFinding(f: HeadlineFinding | string): f is HeadlineFinding {
  return typeof f === 'object' && f !== null && 'finding' in f;
}

export function ReportView({ report }: { report: SynthesisReport }) {
  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Overall risk</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase ${OVERALL_STYLE[report.overall_risk]}`}>
            {report.overall_risk}
          </span>
        </div>

        {report.headline_findings.length > 0 && (
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {report.headline_findings.map((entry, i) => {
              const finding = isObjectFinding(entry) ? entry.finding : entry;
              const sources = isObjectFinding(entry) ? entry.sources : [];
              return (
                <li key={i}>
                  <div>• {finding}</div>
                  {sources.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5 pl-3">
                      {sources.map((s, j) => (
                        <span
                          key={`${i}-${j}`}
                          title={s}
                          className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                        >
                          <FileText className="h-3 w-3 shrink-0" aria-hidden />
                          <span className="truncate">{s}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {report.risks.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Findings</h2>
          <div className="space-y-3">
            {report.risks.map((r, i) => (
              <RiskCard key={i} risk={r} />
            ))}
          </div>
        </div>
      )}

      {report.buyer_questions_for_solicitor.length > 0 && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Questions for your solicitor</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {report.buyer_questions_for_solicitor.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Informational summary only — not legal advice. Always commission a full review by a qualified
        conveyancer before bidding.
      </p>
    </section>
  );
}
