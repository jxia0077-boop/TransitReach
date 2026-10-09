import { Fragment, useEffect, useMemo } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';
import { BoardAlightMarkers, LegPath } from '@/features/interchange/components/JourneyMapLayer';
import type { PlannedLeg, TripPoint } from '../types';

/** Teal for a stop, matching its number in the list; slate for where the outing ends. */
function pointIcon(label: string, color: string) {
  const html =
    `<div style="width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;` +
    `justify-content:center;font:700 12px system-ui,sans-serif;background:${color};color:#ffffff;` +
    `border:2px solid #ffffff;box-shadow:0 1px 4px rgba(15,23,42,.45)">${label}</div>`;
  return divIcon({ className: 'trip-stop-marker', html, iconSize: [26, 26], iconAnchor: [13, 13] });
}

interface TripMapLayerProps {
  origin: { lat: number; lon: number } | null;
  /** In visit order; numbered from 1. */
  stops: TripPoint[];
  /** Drawn only when the outing ends somewhere other than the start or the last stop. */
  final: TripPoint | null;
  /** The selected order's journeys, drawn in the same styles as a single journey. */
  legs?: PlannedLeg[];
  /** The journey under the pointer in the itinerary; the others are dimmed while it is set. */
  highlightedLegId?: string | null;
  /** Whether the plan panel is on screen, so the outing is framed clear of it. */
  planPanelOpen: boolean;
}

const NO_LEGS: PlannedLeg[] = [];

/**
 * The page's panels sit over the map: side by side on a wide screen, and on a narrow one
 * the plan across the bottom with the outing collapsed to a bar at the top. Framing to
 * the whole map would put the first and last stop underneath them.
 */
function panelPadding(width: number, height: number, planPanelOpen: boolean) {
  const wide = width >= 1024;
  return {
    paddingTopLeft: (wide ? [400, 48] : [32, planPanelOpen ? 96 : height * 0.5]) as [number, number],
    paddingBottomRight: (wide
      ? [planPanelOpen ? 420 : 48, 48]
      : [32, planPanelOpen ? height * 0.48 : 32]) as [number, number],
  };
}

/** The outing's places on the map, framed together so the whole outing is in view. */
export function TripMapLayer({ origin, stops, final, legs = NO_LEGS, highlightedLegId = null, planPanelOpen }: TripMapLayerProps) {
  const map = useMap();
  const framed = useMemo(
    () => [
      ...(origin ? [origin] : []),
      ...stops,
      ...(final ? [final] : []),
      ...legs.flatMap(planned => planned.journey.legs.flatMap(leg => leg.geometry)),
    ].map(point => [point.lat, point.lon] as [number, number]),
    [origin, stops, final, legs],
  );
  const places = [...(origin ? [origin] : []), ...stops, ...(final ? [final] : [])];
  const frameKey = `${places.map(point => `${point.lat},${point.lon}`).join('|')}#${legs.map(leg => leg.id).join('|')}#${planPanelOpen}`;

  useEffect(() => {
    if (framed.length < 2) return;
    const size = map.getSize();
    map.fitBounds(latLngBounds(framed), { ...panelPadding(size.x, size.y, planPanelOpen), maxZoom: 15 });
    // Keyed on the places and the drawn order, so re-rendering with the same outing
    // leaves the user's own panning and zooming alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, map]);

  return (
    <>
      {legs.map(planned => {
        const emphasised = planned.id === highlightedLegId;
        const dimmed = highlightedLegId !== null && !emphasised;
        return (
        <Fragment key={planned.id}>
          {planned.journey.legs.map(leg => leg.geometry.length < 2 ? null : (
            <LegPath
              key={leg.id}
              leg={leg}
              weight={(leg.mode === 'WALK' ? 4 : 6) + (emphasised ? 3 : 0)}
              opacity={dimmed ? 0.3 : 0.95}
            />
          ))}
          <BoardAlightMarkers legs={planned.journey.legs} />
        </Fragment>
        );
      })}
      {stops.map((stop, index) => (
        <Marker
          key={stop.id}
          position={[stop.lat, stop.lon]}
          icon={pointIcon(String(index + 1), '#0f766e')}
          zIndexOffset={500}
          title={`${index + 1}. ${stop.name}`}
        />
      ))}
      {final && (
        <Marker
          position={[final.lat, final.lon]}
          icon={pointIcon('End', '#475569')}
          zIndexOffset={400}
          title={`Finish: ${final.name}`}
        />
      )}
    </>
  );
}
