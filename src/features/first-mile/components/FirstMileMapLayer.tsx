import {
  Polyline,
  Tooltip,
  Marker,
  Popup,
} from 'react-leaflet';

import L from 'leaflet';

import type {
  FirstMileStopResult,
} from '../types';

interface FirstMileMapLayerProps {
  stops: FirstMileStopResult[];
  selectedStopId: string | null;
  onSelect: (stopId: string) => void;
}

function stationIcon(
  selected: boolean,
) {
  return L.divIcon({
    className:
      'first-mile-station-marker',

    html: `
      <div
        style="
          width: ${selected ? 34 : 28}px;
          height: ${selected ? 34 : 28}px;
          border-radius: 8px;
          background: ${
            selected
              ? '#0f766e'
              : '#ffffff'
          };
          border: 3px solid #0f766e;
          box-shadow:
            0 2px 8px rgba(0,0,0,0.28);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${
            selected ? 18 : 15
          }px;
        "
      >
        <span
          style="
            filter: ${
              selected
                ? 'brightness(0) invert(1)'
                : 'none'
            };
          "
        >
          🚉
        </span>
      </div>
    `,

    iconSize: [
      selected ? 34 : 28,
      selected ? 34 : 28,
    ],

    iconAnchor: [
      selected ? 17 : 14,
      selected ? 17 : 14,
    ],

    popupAnchor: [
      0,
      selected ? -18 : -15,
    ],
  });
}


export function FirstMileMapLayer({
  stops,
  selectedStopId,
  onSelect,
}: FirstMileMapLayerProps) {
  const selected =
    stops.find(
      item =>
        item.stop.stopId === selectedStopId,
    ) ?? null;

  return (
    <>
      {/* AC 3.1.4 — all candidate stations */}
      {stops.map(result => {
        const selectedMarker =
          result.stop.stopId ===
          selectedStopId;

        return (
          <Marker
            key={result.stop.stopId}
            position={[
              result.stop.lat,
              result.stop.lon,
            ]}
            icon={stationIcon(
              result.stop.stopId ===
                selectedStopId,
            )}
            eventHandlers={{
              click: () =>
                onSelect(
                  result.stop.stopId,
                ),
            }}
          >
            <Popup>
              <div>
                <strong>
                  {result.stop.name}
                </strong>

                <div>
                  Accessible station
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* AC 3.1.2 + 3.1.4 — actual OSM walking geometry */}
      {selected &&
        selected.route.geometry.length >
          1 && (
          <Polyline
            positions={selected.route.geometry.map(
              point => [
                point.lat,
                point.lon,
              ],
            )}
            pathOptions={{
              color: '#0d9488',
              weight: 5,
              opacity: 0.85,
            }}
          />
        )}
    </>
  );
}