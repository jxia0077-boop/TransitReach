import type { RiskLevel } from '../types';

const LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very High',
};

const TONES: Record<RiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  moderate: 'bg-amber-50 text-amber-900 border-amber-200',
  high: 'bg-orange-50 text-orange-900 border-orange-200',
  very_high: 'bg-rose-50 text-rose-900 border-rose-200',
};

export function ReliabilityRiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${TONES[level]}`}
    >
      {LABELS[level]} risk
    </span>
  );
}
