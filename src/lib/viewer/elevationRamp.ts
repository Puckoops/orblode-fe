// Elevation colour maps for the survey terrain: which heights the ramp spans, how it is painted, and the
// legend that must match it. Pure, so it runs under `node --test`; the Cesium material lives in elevationMaterial.ts.

import type { TerrainStats } from "@/lib/api/orblodeSvc";
import { ELEVATION_RAMP_STOPS } from "./sceneStyle.ts";

export type ElevationRampId = keyof typeof ELEVATION_RAMP_STOPS;

export const ELEVATION_RAMPS: readonly { id: ElevationRampId; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "viridis", label: "Viridis" },
  { id: "terrain", label: "Terrain" },
  { id: "plasma", label: "Plasma" },
  { id: "grayscale", label: "Grayscale" },
];

export const DEFAULT_ELEVATION_RAMP: ElevationRampId = "classic";

/** The share of the surface's cells left below and above the automatic range, so a crane or a bird doesn't flatten the ramp. */
export const AUTO_RANGE_CLIP = 0.02;

const MIN_SPAN_M = 0.5;
const RAMP_TEXELS = 1024;
const TARGET_BANDS = 10;

export interface ElevationRange {
  min: number;
  max: number;
}

type Rgb = [number, number, number];

export function rampLabel(id: ElevationRampId): string {
  return ELEVATION_RAMPS.find((r) => r.id === id)?.label ?? id;
}

export function isElevationRampId(value: string): value is ElevationRampId {
  return Object.hasOwn(ELEVATION_RAMP_STOPS, value);
}

function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** The ramp's colour at `t`, 0 being the bottom of the range and 1 the top. */
export function rampColor(id: ElevationRampId, t: number): Rgb {
  const stops = ELEVATION_RAMP_STOPS[id];
  const x = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (x > p1 && i < stops.length - 1) continue;
    const [p0, c0] = stops[i - 1];
    const f = p1 > p0 ? clamp01((x - p0) / (p1 - p0)) : 0;
    const a = hexRgb(c0);
    const b = hexRgb(c1);
    return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as Rgb;
  }
  return hexRgb(stops[0][1]);
}

function widen(range: ElevationRange): ElevationRange {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return { min: 0, max: MIN_SPAN_M };
  if (range.max - range.min >= MIN_SPAN_M) return range;
  const mid = (range.min + range.max) / 2;
  return { min: mid - MIN_SPAN_M / 2, max: mid + MIN_SPAN_M / 2 };
}

/** The heights below which `lo` and `hi` of the surface's cells fall, read off its histogram. */
export function percentileRange(stats: TerrainStats, lo = AUTO_RANGE_CLIP, hi = 1 - AUTO_RANGE_CLIP): ElevationRange {
  const buckets = stats.histogram ?? [];
  const bottom = stats.histogram_min ?? stats.min_elevation;
  const top = stats.histogram_max ?? stats.max_elevation;
  const total = buckets.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (!buckets.length || total <= 0 || !(top > bottom)) {
    return widen({ min: stats.min_elevation, max: stats.max_elevation });
  }
  const width = (top - bottom) / buckets.length;
  const heightAt = (q: number) => {
    const target = q * total;
    let seen = 0;
    for (let i = 0; i < buckets.length; i++) {
      const n = Math.max(0, buckets[i]);
      if (n > 0 && seen + n >= target) return bottom + (i + (target - seen) / n) * width;
      seen += n;
    }
    return top;
  };
  return widen({ min: heightAt(lo), max: heightAt(hi) });
}

/** The automatic range, rounded outward to the decimetre. */
export function autoRange(stats: TerrainStats): ElevationRange {
  const { min, max } = percentileRange(stats);
  return { min: Math.floor(min * 10) / 10, max: Math.ceil(max * 10) / 10 };
}

/** Below this the terrain mesh is filling where the survey has no data, so the colour map leaves it clear. */
export function noDataFloor(stats: TerrainStats): number {
  return stats.min_elevation - Math.max(1, 0.05 * (stats.max_elevation - stats.min_elevation));
}

/** A round band height (1, 2, 2.5 or 5 × 10ⁿ m) giving about ten bands across the range. */
export function bandStep(range: ElevationRange): number {
  const raw = Math.max(range.max - range.min, MIN_SPAN_M) / TARGET_BANDS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  const nice = n < 1.5 ? 1 : n < 2.25 ? 2 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10;
  return nice * magnitude;
}

/** The ramp's position for a height. Bands snap to whole multiples of the band step, so their edges fall on round heights. */
export function rampPosition(height: number, range: ElevationRange, bands: boolean): number {
  const span = range.max - range.min;
  if (!bands) return clamp01((height - range.min) / span);
  const step = bandStep(range);
  const first = Math.floor(range.min / step);
  const last = Math.max(first, Math.ceil(range.max / step) - 1);
  const band = Math.min(Math.max(Math.floor(height / step), first), last);
  return last === first ? 0.5 : (band - first) / (last - first);
}

export function colorAt(id: ElevationRampId, height: number, range: ElevationRange, bands: boolean): Rgb {
  return rampColor(id, rampPosition(height, range, bands));
}

/** One row of RGBA texels spanning the range bottom to top, sampled by the terrain shader. */
export function paintRamp(id: ElevationRampId, range: ElevationRange, bands: boolean, texels = RAMP_TEXELS): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(texels * 4);
  const span = range.max - range.min;
  for (let x = 0; x < texels; x++) {
    const [r, g, b] = colorAt(id, range.min + ((x + 0.5) / texels) * span, range, bands);
    out.set([r, g, b, 255], x * 4);
  }
  return out;
}

const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

export function cssColorAt(id: ElevationRampId, height: number, range: ElevationRange, bands: boolean): string {
  return css(colorAt(id, height, range, bands));
}

/** A CSS gradient drawing the legend bar from the bottom of the range up. */
export function legendGradient(id: ElevationRampId, range: ElevationRange, bands: boolean): string {
  if (!bands) {
    const stops = ELEVATION_RAMP_STOPS[id].map(([p, c]) => `${c} ${(p * 100).toFixed(1)}%`);
    return `linear-gradient(to top, ${stops.join(", ")})`;
  }
  const step = bandStep(range);
  const span = range.max - range.min;
  const pct = (h: number) => `${((clamp01((h - range.min) / span)) * 100).toFixed(2)}%`;
  const stops: string[] = [];
  for (let edge = Math.floor(range.min / step) * step; edge < range.max; edge += step) {
    const color = cssColorAt(id, edge + step / 2, range, true);
    stops.push(`${color} ${pct(edge)}`, `${color} ${pct(Math.min(edge + step, range.max))}`);
  }
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

/** Histogram buckets grouped into `bars`, each with the height at its middle. */
export function histogramBars(stats: TerrainStats, bars: number): { count: number; height: number }[] {
  const buckets = stats.histogram ?? [];
  if (!buckets.length) return [];
  const bottom = stats.histogram_min ?? stats.min_elevation;
  const top = stats.histogram_max ?? stats.max_elevation;
  const n = Math.min(bars, buckets.length);
  return Array.from({ length: n }, (_, i) => {
    const lo = Math.floor((i * buckets.length) / n);
    const hi = Math.floor(((i + 1) * buckets.length) / n);
    let count = 0;
    for (let j = lo; j < hi; j++) count += Math.max(0, buckets[j]);
    return { count, height: bottom + ((i + 0.5) / n) * (top - bottom) };
  });
}
