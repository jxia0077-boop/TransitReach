import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchReliabilityCatalog,
  fetchReliabilityPrediction,
} from '../services/reliabilityApi';
import type {
  CatalogLine,
  CatalogStop,
  ReliabilityPredictionResponse,
  StaticTransitCatalog,
  TransitMode,
} from '../types';

export type PredictionUiStatus =
  | 'idle'
  | 'loading'
  | 'unsupported'
  | 'success'
  | 'error';

export interface ReliabilityFormState {
  mode: TransitMode | null;
  lineId: string | null;
  stopId: string | null;
  /** datetime-local value without timezone, Malaysia wall clock */
  datetimeLocal: string;
}

function defaultDatetimeLocal(): string {
  const now = new Date();
  // Format as Asia/Kuala_Lumpur wall time for the datetime-local input.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find(part => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Convert datetime-local (KL wall clock) to API ISO with +08:00. */
export function toApiDatetime(datetimeLocal: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetimeLocal)) return null;
  return `${datetimeLocal}:00+08:00`;
}

export function useReliabilityCatalog() {
  const [catalog, setCatalog] = useState<StaticTransitCatalog | null>(null);
  const [modes, setModes] = useState<TransitMode[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchReliabilityCatalog(controller.signal)
      .then(data => {
        setCatalog(data);
        const present = new Set(data.lines.map(line => line.mode));
        setModes(
          (['mrt', 'lrt', 'brt'] as TransitMode[]).filter(mode =>
            present.has(mode),
          ),
        );
        setStatus('ready');
        setError(null);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(
          err instanceof Error ? err.message : 'Unable to load transit catalog.',
        );
      });
    return () => controller.abort();
  }, []);

  return { catalog, modes, status, error };
}

export function useReliabilityPrediction() {
  const [form, setForm] = useState<ReliabilityFormState>({
    mode: null,
    lineId: null,
    stopId: null,
    datetimeLocal: defaultDatetimeLocal(),
  });
  const [status, setStatus] = useState<PredictionUiStatus>('idle');
  const [result, setResult] = useState<ReliabilityPredictionResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const updateForm = useCallback((patch: Partial<ReliabilityFormState>) => {
    setForm(previous => ({ ...previous, ...patch }));
  }, []);

  const requestPrediction = useCallback(async () => {
    if (!form.mode || !form.lineId || !form.stopId) {
      setStatus('error');
      setError('Select a mode, line, stop, and travel time.');
      setResult(null);
      return;
    }
    const datetime = toApiDatetime(form.datetimeLocal);
    if (!datetime) {
      setStatus('error');
      setError('Choose a valid travel date and time.');
      setResult(null);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('loading');
    setError(null);
    setResult(null);

    try {
      const prediction = await fetchReliabilityPrediction({
        mode: form.mode,
        lineId: form.lineId,
        stopId: form.stopId,
        datetime,
        signal: controller.signal,
      });
      setResult(prediction);
      setStatus(prediction.supported ? 'success' : 'unsupported');
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setError(
        err instanceof Error ? err.message : 'Unable to request a prediction.',
      );
      setResult(null);
    }
  }, [form]);

  useEffect(() => () => requestRef.current?.abort(), []);

  return {
    form,
    updateForm,
    status,
    result,
    error,
    requestPrediction,
  };
}

export function linesForMode(
  catalog: StaticTransitCatalog | null,
  mode: TransitMode | null,
): CatalogLine[] {
  if (!catalog || !mode) return [];
  return catalog.lines.filter(line => line.mode === mode);
}

export function stopsForLine(
  catalog: StaticTransitCatalog | null,
  lineId: string | null,
): CatalogStop[] {
  if (!catalog || !lineId) return [];
  return catalog.stops
    .filter(stop => stop.line_ids.includes(lineId))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useFilteredCatalogOptions(
  catalog: StaticTransitCatalog | null,
  mode: TransitMode | null,
  lineId: string | null,
) {
  return useMemo(
    () => ({
      lines: linesForMode(catalog, mode),
      stops: stopsForLine(catalog, lineId),
    }),
    [catalog, mode, lineId],
  );
}
