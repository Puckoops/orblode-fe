import type { LonLat, PhotoExif } from "../api/mm.ts";
import { toUtm, zoneOf } from "./utm.ts";

// Where a ground point falls in a nadir drone photo, from the photo's position, height above ground, heading and lens.
// Good to a few percent of the frame: enough to pick the photos that show a target and crop near it, never to place
// the target itself.

/** The diagonal of a 35 mm frame, which the 35 mm-equivalent focal length is measured against. */
const FRAME_DIAGONAL_MM = Math.hypot(36, 24);

export interface Pixel {
  x: number;
  y: number;
}

interface Camera {
  zone: number;
  e: number;
  n: number;
  /** Metres on the ground per pixel. */
  mpp: number;
  cos: number;
  sin: number;
  width: number;
  height: number;
}

/** Height of the camera above the ground: the drone's height above take-off, else its altitude over the ground's. */
export function heightAboveGround(exif: PhotoExif, groundMsl?: number): number | undefined {
  if (exif.rel_alt_m !== undefined && exif.rel_alt_m > 1) return exif.rel_alt_m;
  if (exif.altitude_m !== undefined && groundMsl !== undefined && exif.altitude_m - groundMsl > 1) return exif.altitude_m - groundMsl;
  return undefined;
}

/** Ground sample distance in metres per pixel, when the photo says enough to work it out. */
export function metresPerPixel(exif: PhotoExif, groundMsl?: number): number | undefined {
  const h = heightAboveGround(exif, groundMsl);
  if (h === undefined || !exif.focal_35mm || !exif.width || !exif.height) return undefined;
  return (h * FRAME_DIAGONAL_MM) / exif.focal_35mm / Math.hypot(exif.width, exif.height);
}

function camera(exif: PhotoExif, zone: number, groundMsl?: number): Camera | null {
  const mpp = metresPerPixel(exif, groundMsl);
  if (mpp === undefined || exif.lat === undefined || exif.lon === undefined) return null;
  const at = toUtm(exif.lon, exif.lat, zone);
  const yaw = ((exif.yaw_deg ?? 0) * Math.PI) / 180;
  return { zone, e: at.easting, n: at.northing, mpp, cos: Math.cos(yaw), sin: Math.sin(yaw), width: exif.width!, height: exif.height! };
}

function pixelOf(cam: Camera, e: number, n: number): Pixel {
  const de = e - cam.e;
  const dn = n - cam.n;
  // The top of a nadir frame points along the gimbal's heading, clockwise from north.
  const right = de * cam.cos - dn * cam.sin;
  const up = de * cam.sin + dn * cam.cos;
  return { x: cam.width / 2 + right / cam.mpp, y: cam.height / 2 - up / cam.mpp };
}

const inside = (cam: Camera, p: Pixel, margin: number) =>
  p.x >= cam.width * margin && p.x <= cam.width * (1 - margin) && p.y >= cam.height * margin && p.y <= cam.height * (1 - margin);

/** Where the point should appear in the photo, or null when the photo lacks a position, height or lens. */
export function projectToPixel(exif: PhotoExif, point: LonLat, groundMsl?: number): Pixel | null {
  const zone = zoneOf(point.lon);
  const cam = camera(exif, zone, groundMsl);
  if (!cam) return null;
  const at = toUtm(point.lon, point.lat, zone);
  return pixelOf(cam, at.easting, at.northing);
}

export interface Candidate extends Pixel {
  name: string;
  /** From the frame's centre, in pixels: nearer the centre is less distorted. */
  offCentre: number;
}

/** The photos that should show the point, nearest their centre first, at most max of them. */
export function candidatePhotos(
  photos: readonly { name: string; exif: PhotoExif }[],
  point: LonLat,
  { groundMsl, margin = 0.04, max = 8 }: { groundMsl?: number; margin?: number; max?: number } = {}
): Candidate[] {
  const zone = zoneOf(point.lon);
  const at = toUtm(point.lon, point.lat, zone);
  const out: Candidate[] = [];
  for (const photo of photos) {
    const cam = camera(photo.exif, zone, groundMsl);
    if (!cam) continue;
    const p = pixelOf(cam, at.easting, at.northing);
    if (!inside(cam, p, margin)) continue;
    out.push({ name: photo.name, ...p, offCentre: Math.hypot(p.x - cam.width / 2, p.y - cam.height / 2) });
  }
  return out.sort((a, b) => a.offCentre - b.offCentre).slice(0, max);
}

const median = (values: number[]) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The flight's typical ground sample distance in centimetres. */
export function flightGsdCm(photos: readonly { exif: PhotoExif }[], groundMsl?: number): number | undefined {
  const gsd = median(photos.map((p) => metresPerPixel(p.exif, groundMsl)).filter((v): v is number => v !== undefined));
  return gsd === undefined ? undefined : gsd * 100;
}

function inRing(e: number, n: number, ring: readonly [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ei, ni] = ring[i];
    const [ej, nj] = ring[j];
    if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) hit = !hit;
  }
  return hit;
}

/** The outer rings of a GeoJSON Polygon or MultiPolygon, as [lon, lat] pairs. */
export function outerRings(geometry: { type: string; coordinates: unknown } | null | undefined): [number, number][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [(geometry.coordinates as [number, number][][])[0]];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as [number, number][][][]).map((p) => p[0]);
  return [];
}

export interface Coverage {
  /** Share of the area seen by at least one photo, 0–100. */
  coveredPct: number;
  /** How many photos see a typical point of the area; photogrammetry wants about nine or more. */
  medianPhotos: number;
  /** Sample points tested. */
  samples: number;
}

/** How well the photos cover the area, sampled on a grid of about maxSamples points. */
export function coverage(
  photos: readonly { exif: PhotoExif }[],
  rings: readonly [number, number][][],
  { groundMsl, maxSamples = 2500 }: { groundMsl?: number; maxSamples?: number } = {}
): Coverage | null {
  const first = rings[0]?.[0];
  if (!first) return null;
  const zone = zoneOf(first[0]);
  const utmRings = rings.map((r) => r.map(([lon, lat]) => {
    const u = toUtm(lon, lat, zone);
    return [u.easting, u.northing] as [number, number];
  }));
  const all = utmRings.flat();
  const minE = Math.min(...all.map((p) => p[0]));
  const maxE = Math.max(...all.map((p) => p[0]));
  const minN = Math.min(...all.map((p) => p[1]));
  const maxN = Math.max(...all.map((p) => p[1]));
  const step = Math.max(1, Math.sqrt(((maxE - minE) * (maxN - minN)) / maxSamples));
  const cams = photos.map((p) => camera(p.exif, zone, groundMsl)).filter((c): c is Camera => c !== null);

  let samples = 0;
  let covered = 0;
  const counts: number[] = [];
  for (let n = minN + step / 2; n < maxN; n += step) {
    for (let e = minE + step / 2; e < maxE; e += step) {
      if (!utmRings.some((r) => inRing(e, n, r))) continue;
      samples++;
      let seen = 0;
      for (const cam of cams) if (inside(cam, pixelOf(cam, e, n), 0)) seen++;
      if (seen > 0) covered++;
      counts.push(seen);
    }
  }
  if (samples === 0) return null;
  return { coveredPct: (100 * covered) / samples, medianPhotos: median(counts) ?? 0, samples };
}
