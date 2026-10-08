import { useEffect, useMemo, useState } from 'react';
import { BaseMap, LocationSearch } from '@/features/reachability';
import {
  formatCoord,
  hitFromOrigin,
  hitName,
  hitPosition,
  isInStudyArea,
  nearestAreaName,
  originFromHit,
} from '@/features/reachability/reachabilityService';
import type { Journey, Origin } from '@/features/reachability/types';
import {
  MAX_STOPS,
  MIN_STOPS,
  OutingStopList,
  StopSearch,
  TripMapLayer,
  stopPoint,
  type FinalDestination,
  type OutingDraft,
} from '@/features/trip-planner';
import { loadRailFeedMetadata } from '@/shared/data/adapters/gtfsAdapter';
import { addDays, malaysiaToday } from './components/WeatherPlanning';

const OUTSIDE_AREA = 'That point is outside the area the transit data covers.';

const FINAL_OPTIONS: Array<{ kind: FinalDestination['kind']; label: string }> = [
  { kind: 'none', label: 'At the last stop' },
  { kind: 'origin', label: 'Back at the start' },
  { kind: 'place', label: 'Somewhere else' },
];

function originName(origin: Origin): string {
  return origin.place?.name ?? origin.stop?.name ?? origin.busStop?.name ??
    `Pinned point · ${nearestAreaName(origin.at) ?? formatCoord(origin.at)}`;
}

interface TripPlannerPageProps {
  /** The starting point and departure are the ones every other screen uses. */
  journey: Journey;
  draft: OutingDraft;
}

/**
 * Epic 2 — plan one outing with several stops.
 *
 * AC 2.1.1 — the starting point, departure, stops and finish are all on screen before
 * anything is calculated.
 */
export function TripPlannerPage({ journey, draft }: TripPlannerPageProps) {
  const { origin, onOriginChange, onDepartureChange } = journey;
  const departure = journey.departure ?? `${malaysiaToday()}T09:00`;
  const [notice, setNotice] = useState<string | null>(null);
  // "Somewhere else" is a choice before it is a place, so it is held here until one is picked.
  const [choosingFinalPlace, setChoosingFinalPlace] = useState(false);

  const [today, setToday] = useState(malaysiaToday);
  useEffect(() => {
    const timer = setInterval(() => setToday(malaysiaToday()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // The same window the Map page offers: the coming week, where the timetable covers it.
  const supportedDates = useMemo(() => {
    const feed = loadRailFeedMetadata().feeds[0];
    const iso = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    return Array.from({ length: 7 }, (_, index) => addDays(today, index))
      .filter(date => feed && date >= iso(feed.serviceDateRange.start) && date <= iso(feed.serviceDateRange.end));
  }, [today]);

  const stopPoints = useMemo(() => draft.stops.map(stopPoint), [draft.stops]);
  const addedIds = useMemo(() => new Set(draft.stops.map(stop => stop.service.id)), [draft.stops]);
  const finalKind = choosingFinalPlace ? 'place' : draft.final.kind;
  const finalPlace = draft.final.kind === 'place' ? draft.final.point : null;

  const chooseFinal = (kind: FinalDestination['kind']) => {
    setChoosingFinalPlace(kind === 'place');
    if (kind !== 'place') draft.setFinal({ kind });
  };

  const missing = [
    !origin && 'a starting point',
    draft.stops.length < MIN_STOPS && `${MIN_STOPS - draft.stops.length} more ${MIN_STOPS - draft.stops.length === 1 ? 'stop' : 'stops'}`,
    finalKind === 'place' && !finalPlace && 'a place to finish',
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="fixed left-0 right-0 top-16 bottom-0 overflow-hidden bg-[#080f18]">
      <div className="absolute inset-0">
        <BaseMap
          origin={origin}
          regions={null}
          onMapClick={at => {
            if (!isInStudyArea(at)) {
              setNotice(OUTSIDE_AREA);
              return;
            }
            setNotice(null);
            onOriginChange({ at, source: 'map' });
          }}
        >
          <TripMapLayer origin={origin?.at ?? null} stops={stopPoints} final={finalPlace} />
        </BaseMap>
      </div>

      <aside
        aria-label="Outing"
        className="glass absolute left-2 right-2 top-2 z-[500] max-h-[55%] overflow-y-auto p-4 scrollbar-thin sm:left-4 sm:right-auto sm:top-4 sm:w-[360px] lg:bottom-4 lg:max-h-none"
      >
        <h1 className="text-xl font-bold">Plan an outing</h1>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          Choose where you start, when you leave and the places you need to visit.
        </p>

        <section className="mt-4 space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Start</h2>
          <LocationSearch
            onSelect={hit => { setNotice(null); onOriginChange(originFromHit(hit)); }}
            selected={hitFromOrigin(origin)}
            compact
          />
          {origin && <p className="text-xs text-slate-500">Starting from {originName(origin)}</p>}
          {notice && <p role="alert" className="text-xs text-rose-500">{notice}</p>}
        </section>

        <section className="mt-4">
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2" htmlFor="outing-departure">
            Leave · Malaysia time (UTC+8)
          </label>
          <input
            id="outing-departure"
            type="datetime-local"
            value={departure}
            disabled={!supportedDates.length || !onDepartureChange}
            min={`${supportedDates[0]}T00:00`}
            max={`${supportedDates[supportedDates.length - 1]}T23:59`}
            className="glass-input w-full px-3 py-2 text-sm"
            onChange={event => {
              const value = event.target.value;
              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && supportedDates.includes(value.slice(0, 10)) && event.target.validity.valid) {
                onDepartureChange?.(value);
              }
            }}
          />
          {!supportedDates.length && <p role="alert" className="mt-1 text-xs text-rose-500">The loaded transit timetable does not support the coming week.</p>}
        </section>

        <section className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Stops</h2>
            <span className="text-xs text-slate-500">{draft.stops.length} of {MAX_STOPS}</span>
          </div>
          <OutingStopList
            stops={draft.stops}
            onMove={draft.moveStop}
            onRemove={draft.removeStop}
            onVisitMinutesChange={draft.setVisitMinutes}
          />
          {draft.stops.length < MAX_STOPS ? (
            <StopSearch near={origin?.at ?? null} addedIds={addedIds} canAdd onAdd={draft.addStop} />
          ) : (
            <p className="text-xs text-slate-500">An outing holds up to {MAX_STOPS} stops. Remove one to add another.</p>
          )}
        </section>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Finish</legend>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Where the outing finishes">
            {FINAL_OPTIONS.map(option => (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={finalKind === option.kind}
                onClick={() => chooseFinal(option.kind)}
                className={`chip ${finalKind === option.kind ? 'chip-selected' : 'chip-unselected'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {finalKind === 'place' && (
            <div className="mt-2 space-y-2">
              {finalPlace && <p className="text-xs text-slate-500">Finishing at {finalPlace.name}</p>}
              <LocationSearch
                onSelect={hit => draft.setFinal({ kind: 'place', point: { id: 'final', name: hitName(hit), ...hitPosition(hit) } })}
                compact
              />
            </div>
          )}
        </fieldset>

        <p role="status" className="mt-4 text-xs text-slate-500">
          {missing.length > 0 ? `Still needed: ${missing.join(', ')}.` : 'This outing is ready to plan.'}
        </p>
      </aside>
    </div>
  );
}
