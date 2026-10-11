// The view grid's maths: lines of constant easting and northing in the working CRS, spaced by a
// power of ten chosen from the zoom. Every tenth line is major. The minor lines fade in as they
// spread from GRID_FADE_PX to ten times that apart, so when a zoom crosses into the next power the
// lines that change role are already at the same opacity and nothing jumps.

/** Minor lines this close together, in CSS pixels, are fully faded out. */
export const GRID_FADE_PX = 10;

export interface GridLevel {
  minor: number;
  major: number;
}

export interface Extent {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/** The grid for a scale in CRS units per pixel, or null when the scale is unusable. */
export function gridLevel(unitsPerPx: number): GridLevel | null {
  if (!(unitsPerPx > 0) || !Number.isFinite(unitsPerPx)) return null;
  const minor = 10 ** Math.ceil(Math.log10(unitsPerPx * GRID_FADE_PX));
  return { minor, major: minor * 10 };
}

/** How far the minor lines have faded in at this scale, eased from 0 to 1. */
export function minorOpacity(minor: number, unitsPerPx: number): number {
  const t = Math.min(1, Math.max(0, Math.log10(minor / unitsPerPx / GRID_FADE_PX)));
  return t * t * (3 - 2 * t);
}

/** The spacing a reader sees: the minor lines once they show, the major lines before that. */
export function visibleSpacing(level: GridLevel, unitsPerPx: number): number {
  return minorOpacity(level.minor, unitsPerPx) >= 0.15 ? level.minor : level.major;
}

/** Multiples of `spacing` within [min, max], leaving out every `skipEvery`th one when it is set. */
export function gridValues(min: number, max: number, spacing: number, skipEvery = 0): number[] {
  const values: number[] = [];
  if (!(spacing > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return values;
  const last = Math.floor(max / spacing);
  for (let i = Math.ceil(min / spacing); i <= last; i++) {
    if (skipEvery && i % skipEvery === 0) continue;
    values.push(i * spacing);
  }
  return values;
}

export function squareAround(e: number, n: number, half: number): Extent {
  return { minE: e - half, minN: n - half, maxE: e + half, maxN: n + half };
}

export function containsExtent(outer: Extent, inner: Extent): boolean {
  return (
    inner.minE >= outer.minE && inner.maxE <= outer.maxE && inner.minN >= outer.minN && inner.maxN <= outer.maxN
  );
}

export function formatGridSpacing(spacing: number, units: string): string {
  const [value, unit] = units === "m" && spacing >= 1000 ? [spacing / 1000, "km"] : [spacing, units];
  const digits = Math.max(0, Math.ceil(-Math.log10(value) - 1e-9));
  return `${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
}
