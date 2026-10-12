import { clamp } from "./math.ts";
import { quantile } from "./raster.ts";
import type { Featured, SceneFrame } from "./site.ts";

/**
 * Heights on a square-celled grid in site-local metres. Rows run from the north edge: cell
 * (row, col) is centred at x = x0 + (col + 0.5) * cell, y = y1 - (row + 0.5) * cell. Holes are NaN.
 */
export type SurveyGrid = { nx: number; ny: number; cell: number; x0: number; y1: number; z: Float32Array };

/** Bilinear height at (x, y), from the finite corners only; NaN off the data. */
export function heightOn(grid: SurveyGrid, x: number, y: number) {
  const fc = (x - grid.x0) / grid.cell - 0.5, fr = (grid.y1 - y) / grid.cell - 0.5;
  if (fc < -0.5 || fr < -0.5 || fc > grid.nx - 0.5 || fr > grid.ny - 0.5) return NaN;
  const c0 = clamp(Math.floor(fc), 0, grid.nx - 1), r0 = clamp(Math.floor(fr), 0, grid.ny - 1);
  const c1 = Math.min(c0 + 1, grid.nx - 1), r1 = Math.min(r0 + 1, grid.ny - 1);
  const tc = clamp(fc - c0, 0, 1), tr = clamp(fr - r0, 0, 1);
  let sum = 0, weight = 0;
  for (const [r, c, w] of [
    [r0, c0, (1 - tr) * (1 - tc)],
    [r0, c1, (1 - tr) * tc],
    [r1, c0, tr * (1 - tc)],
    [r1, c1, tr * tc],
  ]) {
    const v = grid.z[r * grid.nx + c];
    if (Number.isFinite(v) && w > 0) {
      sum += v * w;
      weight += w;
    }
  }
  return weight > 0 ? sum / weight : NaN;
}

/** Frames the views on the grid's data and, when there is one, on the featured measurement. */
export function frameFor(grid: SurveyGrid, featured: Featured | null): SceneFrame {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let row = 0; row < grid.ny; row++) {
    for (let col = 0; col < grid.nx; col++) {
      if (!Number.isFinite(grid.z[row * grid.nx + col])) continue;
      const x = grid.x0 + (col + 0.5) * grid.cell, y = grid.y1 - (row + 0.5) * grid.cell;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const ground = quantile(grid.z, 0.5);
  let focus: SceneFrame["focus"] = null;
  if (featured) {
    const z = heightOn(grid, featured.centre[0], featured.centre[1]);
    focus = { x: featured.centre[0], y: featured.centre[1], z: Number.isFinite(z) ? z : ground, reach: featured.reach };
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    radius: Math.max(50, (maxX - minX) / 2, (maxY - minY) / 2),
    extent: [minX - grid.cell / 2, minY - grid.cell / 2, maxX + grid.cell / 2, maxY + grid.cell / 2],
    ground,
    low: quantile(grid.z, 0.15),
    focus,
  };
}

/** Distance along the west–east line through `y`, against height, skipping holes. */
export function gridProfile(grid: SurveyGrid, y: number, step: number): [number, number][] {
  const west = grid.x0, east = grid.x0 + grid.nx * grid.cell, out: [number, number][] = [];
  for (let d = 0; d <= east - west; d += step) {
    const z = heightOn(grid, west + d, y);
    if (Number.isFinite(z)) out.push([d, z]);
  }
  return out;
}
