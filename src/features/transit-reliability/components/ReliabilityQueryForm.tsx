import { Loader2 } from 'lucide-react';
import type { CatalogLine, CatalogStop, TransitMode } from '../types';
import type { ReliabilityFormState } from '../hooks/useReliabilityPrediction';

const MODE_LABELS: Record<TransitMode, string> = {
  mrt: 'MRT',
  lrt: 'LRT',
  brt: 'BRT',
  mrl: 'Monorail',
};

interface Props {
  modes: TransitMode[];
  lines: CatalogLine[];
  stops: CatalogStop[];
  form: ReliabilityFormState;
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  predicting: boolean;
  onChange: (patch: Partial<ReliabilityFormState>) => void;
  onSubmit: () => void;
}

export function ReliabilityQueryForm({
  modes,
  lines,
  stops,
  form,
  catalogStatus,
  catalogError,
  predicting,
  onChange,
  onSubmit,
}: Props) {
  const canSubmit =
    catalogStatus === 'ready' &&
    !!form.mode &&
    !!form.lineId &&
    !!form.stopId &&
    !!form.datetimeLocal &&
    !predicting;

  return (
    <form
      className="glass p-5 space-y-4"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <label className="block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Mode
          </span>
          <select
            className="glass-input w-full px-3 py-2 text-sm"
            value={form.mode ?? ''}
            disabled={catalogStatus !== 'ready'}
            onChange={event => {
              const mode = (event.target.value || null) as TransitMode | null;
              onChange({ mode, lineId: null, stopId: null });
            }}
          >
            <option value="">Select mode</option>
            {modes.map(mode => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Line
          </span>
          <select
            className="glass-input w-full px-3 py-2 text-sm"
            value={form.lineId ?? ''}
            disabled={!form.mode || lines.length === 0}
            onChange={event =>
              onChange({
                lineId: event.target.value || null,
                stopId: null,
              })
            }
          >
            <option value="">Select line</option>
            {lines.map(line => (
              <option key={line.line_id} value={line.line_id}>
                {line.short_name} — {line.long_name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Stop / station
          </span>
          <select
            className="glass-input w-full px-3 py-2 text-sm"
            value={form.stopId ?? ''}
            disabled={!form.lineId || stops.length === 0}
            onChange={event =>
              onChange({ stopId: event.target.value || null })
            }
          >
            <option value="">Select stop</option>
            {stops.map(stop => (
              <option key={stop.stop_id} value={stop.stop_id}>
                {stop.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            Travel date & time
          </span>
          <input
            type="datetime-local"
            className="glass-input w-full px-3 py-2 text-sm"
            value={form.datetimeLocal}
            min="2019-01-01T00:00"
            max="2026-12-31T23:59"
            step={60}
            onChange={event =>
              onChange({ datetimeLocal: event.target.value })
            }
          />
        </label>
      </div>

      {catalogStatus === 'loading' && (
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <Loader2 size={16} className="spinner text-teal-600" />
          Loading MRT / LRT / BRT catalog…
        </p>
      )}
      {catalogStatus === 'error' && (
        <p className="text-sm text-rose-700">
          {catalogError ?? 'Catalog unavailable. Is the reliability API running?'}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          {predicting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="spinner" />
              Predicting…
            </span>
          ) : (
            'Get reliability estimate'
          )}
        </button>
        <p className="text-xs text-slate-500">
          All loaded MRT, LRT and BRT lines can be selected. AI predictions appear
          only where sufficient historical operational data exist.
        </p>
      </div>
    </form>
  );
}
