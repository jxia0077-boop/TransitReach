import { Gauge } from 'lucide-react';
import { ReliabilityQueryForm } from '@/features/transit-reliability/components/ReliabilityQueryForm';
import { ReliabilityResultCard } from '@/features/transit-reliability/components/ReliabilityResultCard';
import { PredictionExplanation } from '@/features/transit-reliability/components/PredictionExplanation';
import { PredictionDataStatus } from '@/features/transit-reliability/components/PredictionDataStatus';
import {
  useFilteredCatalogOptions,
  useReliabilityCatalog,
  useReliabilityPrediction,
} from '@/features/transit-reliability/hooks/useReliabilityPrediction';

export function ReliabilityPage() {
  const catalogState = useReliabilityCatalog();
  const {
    form,
    updateForm,
    status,
    result,
    error,
    requestPrediction,
  } = useReliabilityPrediction();
  const { lines, stops } = useFilteredCatalogOptions(
    catalogState.catalog,
    form.mode,
    form.lineId,
  );

  const selectedLine = lines.find(line => line.line_id === form.lineId);
  const selectedStop = stops.find(stop => stop.stop_id === form.stopId);
  const selectionSummary =
    selectedLine && selectedStop
      ? `${form.mode?.toUpperCase()} · ${selectedLine.short_name} · ${selectedStop.name} · ${form.datetimeLocal.replace('T', ' ')} (MYT)`
      : null;

  return (
    <div className="min-h-screen pt-16">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <header className="mb-2">
          <div className="flex items-center gap-3 mb-2">
            <Gauge className="text-teal-600" size={28} />
            <h1 className="text-3xl font-bold text-slate-900">
              Transit reliability
            </h1>
          </div>
          <p className="text-slate-600 max-w-3xl">
            Estimate how reliable a supported MRT, LRT or BRT service is likely
            to be at your selected travel time so you can allow for waiting,
            delay or missed connections.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            AI estimates describe expected operational reliability and are not
            guaranteed arrival times.
          </p>
        </header>

        <ReliabilityQueryForm
          modes={catalogState.modes}
          lines={lines}
          stops={stops}
          form={form}
          catalogStatus={catalogState.status}
          catalogError={catalogState.error}
          predicting={status === 'loading'}
          onChange={updateForm}
          onSubmit={requestPrediction}
        />

        <ReliabilityResultCard
          status={status}
          result={result}
          error={error}
          selectionSummary={selectionSummary}
        />

        <PredictionDataStatus status={status} result={result} />
        <PredictionExplanation result={result} />
      </div>
    </div>
  );
}
