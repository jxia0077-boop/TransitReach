import type { ReliabilityPredictionResponse } from '../types';
import type { PredictionUiStatus } from '../hooks/useReliabilityPrediction';

interface Props {
  status: PredictionUiStatus;
  result: ReliabilityPredictionResponse | null;
}

export function PredictionDataStatus({ status, result }: Props) {
  if (status === 'idle' || status === 'loading' || status === 'error') {
    return null;
  }

  if (result && !result.supported) {
    return (
      <div className="glass p-5 text-sm text-slate-700 space-y-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Data status
        </h2>
        <p>
          Historical forecast: unavailable — insufficient historical operational
          data.
        </p>
        <p>Realtime adjustment: unavailable.</p>
      </div>
    );
  }

  if (result?.supported) {
    const live = result.prediction_type === 'live_adjusted' && result.realtime_used;
    return (
      <div className="glass p-5 text-sm text-slate-700 space-y-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Data status
        </h2>
        <p>
          {live
            ? 'Live-adjusted AI prediction'
            : 'Historical forecast (realtime adjustment unavailable)'}
        </p>
        {live && result.realtime_timestamp && (
          <p>
            Realtime data updated:{' '}
            {new Date(result.realtime_timestamp).toLocaleString('en-MY', {
              timeZone: 'Asia/Kuala_Lumpur',
            })}
          </p>
        )}
        {result.methodology && (
          <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
            <p>Model: {result.model_version}</p>
            <p>Model type: {result.methodology.model_type}</p>
            <p>Data: {result.methodology.data_sources.join(', ')}</p>
            <p>
              Realtime contributed:{' '}
              {result.methodology.realtime_contributed ? 'Yes' : 'No'}
            </p>
            {result.methodology.training_period && (
              <p>
                Training period: {result.methodology.training_period.start} –{' '}
                {result.methodology.training_period.end}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
