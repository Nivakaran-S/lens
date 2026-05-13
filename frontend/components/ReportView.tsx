import { AlertTriangle, CheckCircle2, FileText, Home, XCircle } from 'lucide-react';
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

function tenureLabel(t?: string): string | null {
  if (!t) return null;
  const lc = t.toLowerCase();
  if (lc === 'freehold') return 'Freehold';
  if (lc === 'leasehold') return 'Leasehold';
  if (lc === 'commonhold') return 'Commonhold';
  return t; // unknown or already friendly
}

export function ReportView({ report }: { report: SynthesisReport }) {
  // Default every array so .map / .length can't crash on partial reports.
  const overallRisk = report.overall_risk ?? 'low';
  const headlines = report.headline_findings ?? [];
  const risks = report.risks ?? [];
  const questions = report.buyer_questions_for_solicitor ?? [];
  const summary = report.property_summary ?? {};
  const consistency = report.cross_document_consistency ?? {};
  const consistencyNotes = consistency.notes ?? [];

  const hasSummary =
    summary.address || summary.tenure || summary.title_number ||
    (summary.registered_owners?.length ?? 0) > 0 || summary.lot_id;

  return (
    <section className="space-y-6">
      {/* ── Property summary ─────────────────────────────────────── */}
      {hasSummary && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-zinc-500" aria-hidden />
            <h2 className="text-base font-semibold">Property summary</h2>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {summary.address && (
              <>
                <dt className="text-zinc-500">Address</dt>
                <dd className="font-medium">{summary.address}</dd>
              </>
            )}
            {summary.tenure && (
              <>
                <dt className="text-zinc-500">Tenure</dt>
                <dd className="font-medium">{tenureLabel(summary.tenure)}</dd>
              </>
            )}
            {summary.title_number && (
              <>
                <dt className="text-zinc-500">Title number</dt>
                <dd className="font-mono">{summary.title_number}</dd>
              </>
            )}
            {summary.lot_id && (
              <>
                <dt className="text-zinc-500">Lot</dt>
                <dd className="font-mono">{summary.lot_id}</dd>
              </>
            )}
            {summary.registered_owners && summary.registered_owners.length > 0 && (
              <>
                <dt className="text-zinc-500">Registered owner(s)</dt>
                <dd className="font-medium">{summary.registered_owners.join('; ')}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* ── Overall risk + headlines ─────────────────────────────── */}
      <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Overall risk</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase ${OVERALL_STYLE[overallRisk] ?? OVERALL_STYLE.low}`}>
            {overallRisk}
          </span>
        </div>

        {headlines.length > 0 && (
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {headlines.map((entry, i) => {
              const finding = isObjectFinding(entry) ? entry.finding : entry;
              const sources = isObjectFinding(entry) ? entry.sources ?? [] : [];
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

      {/* ── Cross-document consistency ───────────────────────────── */}
      {(consistency.executor_matches_proprietor !== undefined ||
        consistency.epc_address_matches_title !== undefined ||
        consistencyNotes.length > 0) && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Cross-document checks</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {consistency.executor_matches_proprietor !== undefined && (
              <ConsistencyRow
                label="Executor matches the registered proprietor"
                ok={consistency.executor_matches_proprietor}
              />
            )}
            {consistency.epc_address_matches_title !== undefined && (
              <ConsistencyRow
                label="EPC address matches the title address"
                ok={consistency.epc_address_matches_title}
              />
            )}
            {consistencyNotes.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Findings ────────────────────────────────────────────── */}
      {risks.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Findings</h2>
          <div className="space-y-3">
            {risks.map((r, i) => (
              <RiskCard key={i} risk={r} />
            ))}
          </div>
        </div>
      )}

      {/* ── Questions for solicitor ─────────────────────────────── */}
      {questions.length > 0 && (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Questions for your solicitor</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            {questions.map((q, i) => (
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

function ConsistencyRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      )}
      <span>{label}</span>
    </li>
  );
}
