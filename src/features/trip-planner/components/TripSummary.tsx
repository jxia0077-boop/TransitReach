import { aroundTime, durationLabel } from '../format';
import type { TripTotals } from '../types';

/**
 * AC 2.3.3 — the whole outing in four figures: elapsed time from the requested departure
 * (waiting and visits included), walking, transfers and when it ends.
 */
export function TripSummary({ totals }: { totals: TripTotals }) {
  const figures: Array<[string, string]> = [
    ['Total time', durationLabel(totals.elapsedSeconds)],
    ['Walking', durationLabel(totals.walkSeconds)],
    ['Transfers', String(totals.transfers)],
    ['Finish', aroundTime(totals.finishTime)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2" aria-label="Whole outing summary">
      {figures.map(([label, value]) => (
        <div key={label} className="glass-chip p-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-0.5 text-sm font-bold text-slate-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
