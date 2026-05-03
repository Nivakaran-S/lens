import type { Risk, RiskSeverity } from '../lib/types';

const SEVERITY_STYLE: Record<RiskSeverity, string> = {
  critical: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  high: 'border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200',
  medium: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  low: 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200',
  info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200',
};

export function RiskCard({ risk }: { risk: Risk }) {
  return (
    <article className={`rounded-lg border p-4 ${SEVERITY_STYLE[risk.severity]}`}>
      <header className="flex items-center gap-2">
        <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {risk.severity}
        </span>
        <span className="text-[11px] uppercase tracking-wide opacity-70">{risk.category}</span>
        {risk.blocks_completion && (
          <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Blocks completion
          </span>
        )}
      </header>
      <h3 className="mt-2 text-sm font-semibold">{risk.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed">{risk.explanation}</p>

      {risk.evidence.length > 0 && (
        <div className="mt-3 space-y-1.5 text-xs opacity-90">
          {risk.evidence.map((e, i) => (
            <p key={i}>
              <span className="font-medium">{e.doc_filename}</span>
              {e.page_ref && <span className="opacity-70"> · p.{e.page_ref}</span>}
              {e.quote && <span className="ml-1 italic">“{e.quote}”</span>}
            </p>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs">
        <span className="font-medium">Action: </span>
        {risk.recommended_action}
      </p>
    </article>
  );
}
