import type { OverallRisk } from '../lib/types';

const STYLE: Record<OverallRisk, string> = {
  low: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
};

export function OverallRiskBadge({ risk }: { risk: OverallRisk }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLE[risk]}`}>
      {risk}
    </span>
  );
}
