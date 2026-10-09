import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { CATEGORY_META } from '@/shared/data';
import { loadEssentialServices } from '@/shared/data/adapters/essentialServicesAdapter';
import type { ServiceLocation } from '@/shared/types/service';
import { matchesKind, nearestFirst, straightLineMetres } from '../stopSearch';

const MIN_QUERY_LENGTH = 2;
/** Enough to choose between, few enough to read at a glance. */
const MAX_RESULTS = 5;

interface StopSearchProps {
  /**
   * Where the traveller will be when they need the next place: the stop added last, or
   * the starting point while there are none. Results are the ones closest to it.
   */
  near: { name: string; lat: number; lon: number } | null;
  addedIds: ReadonlySet<string>;
  onAdd: (service: ServiceLocation) => void;
  /** The result under the pointer or keyboard focus, so the map can show where it is. */
  onPreview: (service: ServiceLocation | null) => void;
}

/** "amenity=fast_food" → "Fast food". More exact than the category it is filed under. */
function kindLabel(service: ServiceLocation): string {
  const value = service.sourceCategory?.split('=')[1]?.replace(/_/g, ' ');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : CATEGORY_META[service.category].label;
}

function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Finds a place to add to the outing.
 *
 * Someone planning errands knows they need a pharmacy, not which pharmacy. Typing a kind
 * of place ("pharmacy", "cafe", "mall") therefore lists the few closest to the last stop
 * they added — an outing that has moved across the city should not be offered a cafe back
 * by the starting point. Typing a name still finds that place. Either way the user picks the place — the
 * planner does not choose one for them.
 *
 * It searches the service records the app already holds and sends nothing anywhere, the
 * same rule the starting-point search follows (AC 1.1.3). Distances here are straight
 * lines and say so; travel times come from the routing engine when the outing is planned
 * (AC 2.2.1).
 */
export function StopSearch({ near, addedIds, onAdd, onPreview }: StopSearchProps) {
  const [query, setQuery] = useState('');
  const services = useMemo(() => loadEssentialServices(), []);
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= MIN_QUERY_LENGTH;

  const { nearest, named, kindFound } = useMemo(() => {
    if (!searching) return { nearest: [], named: [], kindFound: false };
    const ofKind = services.filter(service => matchesKind(service, needle));
    // A word that names a kind is read as one. Listing places that merely have it in
    // their name as well put a "Pharmacy" 20 km away under the five closest pharmacies.
    const byName = ofKind.length > 0
      ? []
      : services.filter(service => service.name.toLowerCase().includes(needle));
    return {
      // With nowhere to measure from "closest" has no meaning, so nothing is ranked.
      nearest: near ? nearestFirst(ofKind, near).slice(0, MAX_RESULTS) : [],
      named: (near ? nearestFirst(byName, near) : byName.sort((a, b) => a.name.localeCompare(b.name)))
        .slice(0, MAX_RESULTS),
      kindFound: ofKind.length > 0,
    };
  }, [services, needle, searching, near]);

  const row = (service: ServiceLocation) => {
    const added = addedIds.has(service.id);
    const metres = near ? straightLineMetres(near, service) : null;
    return (
      <li key={service.id}>
        <button
          type="button"
          disabled={added}
          // The row is removed when the search clears, so no leave event follows the click.
          onClick={() => { onAdd(service); setQuery(''); onPreview(null); }}
          onMouseEnter={() => onPreview(service)}
          onMouseLeave={() => onPreview(null)}
          onFocus={() => onPreview(service)}
          onBlur={() => onPreview(null)}
          className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#214154] focus-visible:bg-[#214154]disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800">{service.name}</span>
            <span className="block truncate text-xs text-slate-500">
              {kindLabel(service)}
              {metres !== null && ` · ${distanceLabel(metres)}`}
              {` · ${service.hours ?? 'Hours unknown'}`}
            </span>
          </span>
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-teal-700">
            {added ? <><Check size={13} aria-hidden="true" /> Added</> : <><Plus size={13} aria-hidden="true" /> Add</>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div>
      <div className="glass-input flex items-center gap-2 px-3 py-2.5">
        <Search size={15} className="text-slate-400" aria-hidden="true" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Pharmacy, cafe, mall, or a place name…"
          aria-label="Search for a kind of place or a place name to add to the outing"
          className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
        />
      </div>

      {searching && (
        <div className="mt-2 space-y-2">
          {kindFound && !near && (
            <p className="px-2.5 text-xs text-slate-500">Set a starting point to see the closest ones.</p>
          )}
          {nearest.length > 0 && (
            <section>
              <h3 className="px-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Closest to {near?.name}</h3>
              <ul className="mt-1 space-y-1" aria-label="Closest places">{nearest.map(row)}</ul>
            </section>
          )}
          {named.length > 0 && (
            <section>
              <h3 className="px-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Named “{query.trim()}”</h3>
              <ul className="mt-1 space-y-1" aria-label="Matching names">{named.map(row)}</ul>
            </section>
          )}
          {!kindFound && named.length === 0 && (
            <p className="px-2.5 text-sm text-slate-600">No kind of place or place name matches that.</p>
          )}
          {near && (nearest.length > 0 || named.length > 0) && (
            <p className="px-2.5 text-[11px] text-slate-500">
              Distances are straight lines from {near.name}. Travel times are worked out when you plan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
