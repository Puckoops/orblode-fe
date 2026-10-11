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

/** A sample along a screen edge: its position along the edge, and the grid coordinate there on each axis. */
export interface EdgeSample {
  at: number;
  value: number;
  other: number;
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

/** The smallest 1, 2 or 5 × 10ⁿ multiple of `spacing` whose lines are at least `gapPx` apart. */
export function labelStep(spacing: number, unitsPerPx: number, gapPx: number): number {
  for (let power = 1; ; power *= 10) {
    for (const m of [1, 2, 5]) {
      if ((spacing * m * power) / unitsPerPx >= gapPx || power >= 1e6) return spacing * m * power;
    }
  }
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

/**
 * Where the multiples of `spacing` fall between consecutive samples along an edge, interpolated linearly.
 * Lines that run nearly along the edge, over the whole edge or between two samples, are left out: their
 * value changes less than `minSlope` times the other axis, so where they meet the edge is down to noise
 * in the samples, and the other edge labels them.
 */
export function edgeCrossings(
  samples: (EdgeSample | null)[],
  spacing: number,
  { minSlope = 0.5, maxPerGap = 50 } = {}
): EdgeSample[] {
  const crossings: EdgeSample[] = [];
  const present = samples.filter((s): s is EdgeSample => s !== null);
  if (present.length < 2) return crossings;
  const first = present[0];
  const last = present[present.length - 1];
  if (Math.abs(last.value - first.value) < minSlope * Math.abs(last.other - first.other)) return crossings;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b || a.value === b.value) continue;
    if (Math.abs(b.value - a.value) < minSlope * Math.abs(b.other - a.other)) continue;
    const first = Math.floor(Math.min(a.value, b.value) / spacing) + 1;
    const last = Math.floor(Math.max(a.value, b.value) / spacing);
    // Near the horizon one pixel step can cover kilometres; labels there would be noise.
    if (last - first >= maxPerGap) continue;
    for (let k = first; k <= last; k++) {
      const value = k * spacing;
      const t = (value - a.value) / (b.value - a.value);
      crossings.push({ at: a.at + t * (b.at - a.at), value, other: a.other + t * (b.other - a.other) });
    }
  }
  return crossings;
}

/** Keeps items at least `gap` apart along an edge, earliest first. */
export function spreadAlong<T extends { at: number }>(items: T[], gap: number): T[] {
  const kept: T[] = [];
  for (const item of [...items].sort((a, b) => a.at - b.at)) {
    if (kept.length === 0 || item.at - kept[kept.length - 1].at >= gap) kept.push(item);
  }
  return kept;
}

export function spacingDecimals(spacing: number): number {
  return Math.max(0, Math.ceil(-Math.log10(spacing) - 1e-9));
}

export function formatGridValue(value: number, spacing: number): string {
  const digits = spacingDecimals(spacing);
  // -0 === 0, so this folds negative zero, which would otherwise print as "-0".
  return (value === 0 ? 0 : value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatGridSpacing(spacing: number, units: string): string {
  if (units === "m" && spacing >= 1000) return `${formatGridValue(spacing / 1000, spacing / 1000)} km`;
  return `${formatGridValue(spacing, spacing)} ${units}`;
}
