/**
 * HTTP client for the Epic 7 reliability backend.
 * In dev, Vite proxies `/api` → `http://127.0.0.1:8000`.
 */

import type {
  CatalogLine,
  CatalogStop,
  ReliabilityPredictionResponse,
  StaticTransitCatalog,
  TransitMode,
} from '../types';

const API_BASE = '/api/reliability';

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: string | { msg?: string }[];
    };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      return body.detail[0].msg;
    }
  } catch {
    /* ignore non-JSON error bodies */
  }
  return `Request failed (${response.status})`;
}

export async function fetchReliabilityCatalog(
  signal?: AbortSignal,
): Promise<StaticTransitCatalog> {
  const response = await fetch(`${API_BASE}/catalog`, { signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as StaticTransitCatalog;
}

export async function fetchSelectableModes(
  signal?: AbortSignal,
): Promise<TransitMode[]> {
  const response = await fetch(`${API_BASE}/catalog/modes`, { signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as TransitMode[];
}

export async function fetchCatalogLines(
  mode?: TransitMode,
  signal?: AbortSignal,
): Promise<CatalogLine[]> {
  const params = new URLSearchParams();
  if (mode) params.set('mode', mode);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/catalog/lines${query ? `?${query}` : ''}`,
    { signal },
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as CatalogLine[];
}

export async function fetchCatalogStops(
  lineId?: string,
  signal?: AbortSignal,
): Promise<CatalogStop[]> {
  const params = new URLSearchParams();
  if (lineId) params.set('line_id', lineId);
  const query = params.toString();
  const response = await fetch(
    `${API_BASE}/catalog/stops${query ? `?${query}` : ''}`,
    { signal },
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as CatalogStop[];
}

export interface PredictArgs {
  mode: TransitMode;
  lineId: string;
  stopId: string;
  /** ISO-8601 with offset, e.g. 2026-09-12T18:00:00+08:00 */
  datetime: string;
  signal?: AbortSignal;
}

export async function fetchReliabilityPrediction(
  args: PredictArgs,
): Promise<ReliabilityPredictionResponse> {
  const params = new URLSearchParams({
    mode: args.mode,
    line_id: args.lineId,
    stop_id: args.stopId,
    datetime: args.datetime,
  });
  const response = await fetch(`${API_BASE}/predict?${params}`, {
    signal: args.signal,
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ReliabilityPredictionResponse;
}
