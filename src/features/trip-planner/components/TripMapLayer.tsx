import { useEffect, useMemo } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';
import type { TripPoint } from '../types';

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
}

/** The outing's places on the map, framed together so the whole outing is in view. */
export function TripMapLayer({ origin, stops, final }: TripMapLayerProps) {
  const map = useMap();
  const framed = useMemo(
    () => [...(origin ? [origin] : []), ...stops, ...(final ? [final] : [])]
      .map(point => [point.lat, point.lon] as [number, number]),
    [origin, stops, final],
  );
  const frameKey = framed.map(point => point.join(',')).join('|');

  useEffect(() => {
    if (framed.length < 2) return;
    map.fitBounds(latLngBounds(framed), { padding: [80, 80], maxZoom: 15 });
    // Keyed on the coordinates, so re-rendering with the same places leaves the user's
    // own panning and zooming alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, map]);

  return (
    <>
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
