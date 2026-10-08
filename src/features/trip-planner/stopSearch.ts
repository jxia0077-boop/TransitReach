import { CATEGORY_META } from '@/shared/data';
import type { ServiceLocation } from '@/shared/types/service';

const EARTH_RADIUS_METRES = 6_371_000;

interface Point {
  lat: number;
  lon: number;
}

/** "pharmacies" → "pharmacy", "malls" → "mall", so either form finds the same places. */
function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  return word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/**
 * Whether the query names what kind of place this is, not what it is called.
 *
 * It is matched against the OpenStreetMap tag the record came with ("amenity=cafe",
 * "shop=supermarket") as well as the category it is filed under, because the tag is the
 * finer of the two: "cafe" should not return every restaurant in "Food & Meals".
 * `query` is already lower-cased and trimmed.
 */
export function matchesKind(service: ServiceLocation, query: string): boolean {
  const stem = singular(query);
  // Two letters are inside too many tags ("at" in "atm", "ca" in "cafe") to mean a kind.
  if (stem.length < 3) return false;
  const tag = service.sourceCategory?.split('=')[1]?.replace(/_/g, ' ') ?? '';
  return tag.includes(stem) ||
    service.category === stem ||
    CATEGORY_META[service.category].label.toLowerCase().includes(query);
}

export function straightLineMetres(from: Point, to: { lat?: number; lon?: number }): number {
  if (to.lat === undefined || to.lon === undefined) return Number.POSITIVE_INFINITY;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.lat - from.lat);
  const dLon = radians(to.lon - from.lon);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
}

/** Nearest first; the name breaks ties so the same search always lists the same order. */
export function nearestFirst(services: ServiceLocation[], near: Point): ServiceLocation[] {
  return services
    .map(service => ({ service, metres: straightLineMetres(near, service) }))
    .sort((a, b) => a.metres - b.metres || a.service.name.localeCompare(b.service.name))
    .map(({ service }) => service);
}
