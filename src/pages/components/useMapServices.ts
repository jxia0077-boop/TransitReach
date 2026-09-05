import { useMemo, useState } from 'react';
import { useRealEssentialServices } from '@/features/essential-services';
import { CATEGORY_ORDER } from '@/shared/data';
import { DEPARTURE_TIME, TRAVEL_MODE } from '@/shared/data/adapters/routingAdapter';
import type { LatLng } from '@/features/reachability/types';
import type { ServiceCategory, ServiceLocation } from '@/shared/types/service';

/**
 * Categories shown before the user chooses.
 *
 * "Food & Meals" is off by default, not removed — it is 9,013 of the 19,406 records and
 * around 65% of everything drawn at a central origin, so with it on, seven hospitals and
 * thirty pharmacies disappear under restaurant markers. Epic 5 defines essential services
 * as groceries, healthcare, parks and public services; restaurants are one tap away.
 */
const DEFAULT_CATEGORIES: ServiceCategory[] = CATEGORY_ORDER.filter(
  category => category !== 'food',
);

export interface MapServicesModel {
  status: ReturnType<typeof useRealEssentialServices>['status'];
  error: string | null;
  /** Everything reachable, before the category and name filters. */
  reachableCount: number;
  /** What the map draws and the list shows. */
  displayed: ServiceLocation[];
  counts: Partial<Record<ServiceCategory, number>>;
  categories: Set<ServiceCategory>;
  toggleCategory: (category: ServiceCategory) => void;
  search: string;
  setSearch: (value: string) => void;
  selected: ServiceLocation | null;
  select: (service: ServiceLocation) => void;
}

/**
 * Essential-services coverage for the map panel.
 *
 * `enabled` gates the whole thing: passing a null origin leaves the underlying hook idle,
 * so no isochrone and none of the follow-up travel-time requests are issued while the user
 * is looking at another tab. Without that gate, opening the map would compute a full
 * service coverage nobody asked for, against a two-core routing engine.
 */
export function useMapServices(
  origin: LatLng | null,
  budgetMinutes: number,
  enabled: boolean,
): MapServicesModel {
  const [categories, setCategories] = useState<Set<ServiceCategory>>(
    () => new Set(DEFAULT_CATEGORIES),
  );
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = useRealEssentialServices(
    enabled ? origin : null,
    budgetMinutes,
    TRAVEL_MODE,
    DEPARTURE_TIME,
  );

  const counts = useMemo(
    () => data.services.reduce<Partial<Record<ServiceCategory, number>>>((totals, service) => {
      totals[service.category] = (totals[service.category] ?? 0) + 1;
      return totals;
    }, {}),
    [data.services],
  );

  const displayed = useMemo(
    () => data.services.filter(service =>
      categories.has(service.category) &&
      service.name.toLowerCase().includes(search.toLowerCase().trim()),
    ),
    [data.services, categories, search],
  );

  const selected = data.services.find(service => service.id === selectedId) ?? null;

  return {
    status: data.status,
    error: data.error,
    reachableCount: data.services.length,
    displayed,
    counts,
    categories,
    toggleCategory: category => setCategories(previous => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    }),
    search,
    setSearch,
    selected,
    select: service => {
      setSelectedId(service.id);
      // Estimated travel time is fetched on demand for anything the background pass did
      // not already cover, rather than shown as a guess.
      if (service.estimatedTravelTime === undefined) void data.estimateFor(service);
    },
  };
}
