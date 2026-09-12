import type { ReliabilityPredictionResponse } from '../types';

export function PredictionExplanation({
  result,
}: {
  result: ReliabilityPredictionResponse | null;
}) {
  if (!result?.supported || result.explanations.length === 0) {
    return null;
  }

  return (
    <div className="glass p-5">
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">
        Why this prediction?
      </h2>
      <ul className="space-y-2 text-sm text-slate-700">
        {result.explanations.map(item => (
          <li key={item} className="flex gap-2">
            <span className="text-teal-600 font-bold">↑</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Factors are associated with the estimate; they are not proven causes.
      </p>
    </div>
  );
}
