import type { GeoJSONGeometry, NogoType } from "../api/mm.ts";

/** The kinds of keep-away place, with the distance the mining rules keep from each where they set one. */
export const NOGO_TYPES: Record<NogoType, { label: string; keep?: number }> = {
  bridge: { label: "Bridge", keep: 200 },
  water_intake: { label: "Water intake well", keep: 500 },
  habitation: { label: "Habitation", keep: 100 },
  embankment: { label: "Embankment", keep: 50 },
  airspace_yellow: { label: "Airspace: yellow zone" },
  airspace_red: { label: "Airspace: red zone" },
  other: { label: "Other" },
};

const EARTH_R = 6371008.8;

/** A closed ring of `sides` corners at radiusM around a point, for drawing a keep-away distance; good to a few
 * centimetres at the distances the rules use. */
export function circle(lon: number, lat: number, radiusM: number, sides = 48): GeoJSONGeometry {
  const dLat = (radiusM / EARTH_R) * (180 / Math.PI);
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring = Array.from({ length: sides + 1 }, (_, i) => {
    const a = (2 * Math.PI * (i % sides)) / sides;
    return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)];
  });
  return { type: "Polygon", coordinates: [ring] };
}
