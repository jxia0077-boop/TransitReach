import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { CATEGORY_META } from '@/shared/data';
import { loadEssentialServices } from '@/shared/data/adapters/essentialServicesAdapter';
import type { ServiceLocation } from '@/shared/types/service';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

interface StopSearchProps {
  /** Results nearest this point are listed first; many places share a name. */
  near: { lat: number; lon: number } | null;
  addedIds: ReadonlySet<string>;
  /** False once the outing holds as many stops as the planner compares. */
  canAdd: boolean;
  onAdd: (service: ServiceLocation) => void;
}

/** Good enough to put the nearer of two same-named branches first; never shown as a figure. */
function closeness(near: { lat: number; lon: number }, service: ServiceLocation): number {
  if (service.lat === undefined || service.lon === undefined) return Number.POSITIVE_INFINITY;
  const dLat = service.lat - near.lat;
  const dLon = (service.lon - near.lon) * Math.cos(near.lat * Math.PI / 180);
  return dLat * dLat + dLon * dLon;
}

/**
 * Finds a place to add to the outing, by its name or by what kind of place it is.
 *
 * It searches the service records the app already holds and sends nothing anywhere, the
 * same rule the starting-point search follows (AC 1.1.3). The Map page's Services tab is
 * the other way in, for choosing among places that are within reach.
 */
export function StopSearch({ near, addedIds, canAdd, onAdd }: StopSearchProps) {
  const [query, setQuery] = useState('');
  const services = useMemo(() => loadEssentialServices(), []);
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= MIN_QUERY_LENGTH;

  const results = useMemo(() => {
    if (!searching) return [];
    const matches = services.filter(service =>
      service.name.toLowerCase().includes(needle) ||
      CATEGORY_META[service.category].label.toLowerCase().includes(needle),
    );
    if (near) matches.sort((a, b) => closeness(near, a) - closeness(near, b));
    else matches.sort((a, b) => a.name.localeCompare(b.name));
    return matches.slice(0, MAX_RESULTS);
  }, [services, needle, searching, near]);

  return (
    <div>
      <div className="glass-input flex items-center gap-2 px-3 py-2.5">
        <Search size={15} className="text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search a place or category…"
          aria-label="Search for a place to add to the outing"
          className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
        />
      </div>

      {searching && (
        <ul className="mt-2 space-y-1" aria-label="Matching places">
          {results.map(service => {
            const added = addedIds.has(service.id);
            return (
              <li key={service.id}>
                <button
                  type="button"
                  disabled={added || !canAdd}
                  onClick={() => { onAdd(service); setQuery(''); }}
                  className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{service.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {CATEGORY_META[service.category].label}
                      {service.address ? ` · ${service.address}` : ''}
                      {service.hours ? '' : ' · Hours unknown'}
                    </span>
                  </span>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-700">
                    {added ? <><Check size={13} aria-hidden="true" /> Added</> : <><Plus size={13} aria-hidden="true" /> Add</>}
                  </span>
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-slate-600">No place matches that name or category.</li>
          )}
        </ul>
      )}
      {searching && results.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          {near ? 'Nearest your starting point first.' : 'Set a starting point to list the nearest first.'}
        </p>
      )}
    </div>
  );
}
