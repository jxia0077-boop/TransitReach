import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReliabilityPredictionResponse } from '../types';
import { PREDICTION_UNAVAILABLE_MESSAGE } from '../types';
import { ReliabilityRiskBadge } from './ReliabilityRiskBadge';
import type { PredictionUiStatus } from '../hooks/useReliabilityPrediction';

interface Props {
  status: PredictionUiStatus;
  result: ReliabilityPredictionResponse | null;
  error: string | null;
  selectionSummary: string | null;
}

export function ReliabilityResultCard({
  status,
  result,
  error,
  selectionSummary,
}: Props) {
  if (status === 'idle') {
    return (
      <div className="glass p-5 text-sm text-slate-600">
        Choose a service and travel time, then request a reliability estimate.
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="glass p-5 flex items-center gap-3 text-sm text-slate-700">
        <Loader2 size={18} className="spinner text-teal-600" />
        Requesting reliability prediction…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="glass p-5 border border-rose-200 bg-rose-50/60">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h2 className="text-sm font-bold text-rose-900 mb-1">
              Prediction request failed
            </h2>
            <p className="text-sm text-rose-800">
              {error ?? 'Something went wrong.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unsupported' || (result && !result.supported)) {
    const message =
      result && !result.supported
        ? result.message
        : PREDICTION_UNAVAILABLE_MESSAGE;
    return (
      <div className="glass p-5 space-y-3">
        {selectionSummary && (
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {selectionSummary}
          </p>
        )}
        <h2 className="text-lg font-bold text-slate-900">
          Prediction unavailable
        </h2>
        <p className="text-sm text-slate-700">{message}</p>
        <p className="text-xs text-slate-500">
          No estimated delay or reliability category is shown when historical
          operational data are insufficient.
        </p>
      </div>
    );
  }

  if (status === 'success' && result?.supported) {
    return (
      <div className="glass p-5 space-y-4">
        {selectionSummary && (
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {selectionSummary}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Expected delay: {result.expected_delay_min.toFixed(1)} min
          </h2>
          <ReliabilityRiskBadge level={result.risk_level} />
        </div>
        {result.prediction_lower_min != null &&
          result.prediction_upper_min != null && (
            <p className="text-sm text-slate-600">
              Typical prediction range: {result.prediction_lower_min.toFixed(1)}–
              {result.prediction_upper_min.toFixed(1)} min
            </p>
          )}
        <p className="text-xs text-slate-500">
          AI estimate of operational reliability — not a guaranteed arrival time.
        </p>
      </div>
    );
  }

  return null;
}
