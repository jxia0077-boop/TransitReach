import { useCallback, useMemo, useState } from 'react';
import type { ServiceLocation } from '@/shared/types/service';
import {
  DEFAULT_VISIT_MINUTES,
  MAX_STOPS,
  type FinalDestination,
  type LocatedService,
  type OutingStop,
} from '../types';

export interface OutingDraft {
  /** In the order the user arranged them. */
  stops: OutingStop[];
  final: FinalDestination;
  /** Ignored when the place is already a stop, has no coordinates, or the outing is full. */
  addStop: (service: ServiceLocation) => void;
  removeStop: (id: string) => void;
  moveStop: (id: string, offset: -1 | 1) => void;
  setVisitMinutes: (id: string, minutes: number) => void;
  setFinal: (final: FinalDestination) => void;
}

function isLocated(service: ServiceLocation): service is LocatedService {
  return service.lat !== undefined && service.lon !== undefined;
}

/**
 * The outing as the user has described it so far.
 *
 * AC 2.1.3 — editing it changes only this description. Nothing here asks the routing
 * engine for anything; a plan is calculated when the user requests one.
 */
export function useOutingDraft(): OutingDraft {
  const [stops, setStops] = useState<OutingStop[]>([]);
  const [final, setFinal] = useState<FinalDestination>({ kind: 'none' });

  const addStop = useCallback((service: ServiceLocation) => {
    if (!isLocated(service)) return;
    setStops(previous =>
      previous.length >= MAX_STOPS || previous.some(stop => stop.service.id === service.id)
        ? previous
        : [...previous, { service, visitMinutes: DEFAULT_VISIT_MINUTES }],
    );
  }, []);

  const removeStop = useCallback((id: string) => {
    setStops(previous => previous.filter(stop => stop.service.id !== id));
  }, []);

  const moveStop = useCallback((id: string, offset: -1 | 1) => {
    setStops(previous => {
      const from = previous.findIndex(stop => stop.service.id === id);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= previous.length) return previous;
      const next = [...previous];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }, []);

  const setVisitMinutes = useCallback((id: string, minutes: number) => {
    setStops(previous => previous.map(stop =>
      stop.service.id === id ? { ...stop, visitMinutes: minutes } : stop,
    ));
  }, []);

  return useMemo(() => ({
    stops,
    final,
    addStop,
    removeStop,
    moveStop,
    setVisitMinutes,
    setFinal,
  }), [stops, final, addStop, removeStop, moveStop, setVisitMinutes]);
}
