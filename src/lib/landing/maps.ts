import { clamp, lerp } from "./math.ts";
import { PAD, designLevel, groundColour, rampColour, sample, shade, type Material, type Rgb } from "./terrain.ts";

/** A north-up orthophoto of the `size`-metre square whose south-west corner is (x0, y0), as RGBA. */
export function orthoPixels(x0: number, y0: number, size: number, px: number, firstPileScale = 1): Uint8ClampedArray {
  const res = size / px, n = px + 2;
  const zs = new Float32Array(n * n), materials = new Uint8Array(n * n), piles = new Int8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = sample(x0 + (i - 0.5) * res, y0 + size - (j - 0.5) * res, firstPileScale), k = j * n + i;
      zs[k] = s.z;
      materials[k] = s.material;
      piles[k] = s.pile;
    }
  }
  const out = new Uint8ClampedArray(px * px * 4), colour: Rgb = [0, 0, 0];
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const k = (j + 1) * n + i + 1;
      const hill = shade((zs[k + 1] - zs[k - 1]) / (2 * res), (zs[k - n] - zs[k + n]) / (2 * res));
      groundColour(x0 + (i + 0.5) * res, y0 + size - (j + 0.5) * res, materials[k] as Material, piles[k], colour);
      const o = (j * px + i) * 4;
      out[o] = colour[0] * hill;
      out[o + 1] = colour[1] * hill;
      out[o + 2] = colour[2] * hill * 0.96;
      out[o + 3] = 255;
    }
  }
  return out;
}

const NEUTRAL: Rgb = [44, 39, 34];
const CUT: readonly [Rgb, Rgb] = [[96, 118, 146], [196, 212, 232]];
const FILL: readonly [Rgb, Rgb] = [[176, 104, 66], [246, 206, 168]];

/** Ground above design (cut) runs to blue, below (fill) to copper, saturating at 3 m either way. */
export function cutFillColour(diff: number, out: Rgb): Rgb {
  const t = clamp(Math.abs(diff) / 3, 0, 1), [mid, high] = diff > 0 ? CUT : FILL;
  const a = t < 0.5 ? NEUTRAL : mid, b = t < 0.5 ? mid : high, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  out[0] = lerp(a[0], b[0], k);
  out[1] = lerp(a[1], b[1], k);
  out[2] = lerp(a[2], b[2], k);
  return out;
}

export type CutFillImage = { pixels: Uint8ClampedArray; width: number; height: number };

/** The pad against its design surface at 1 m, turned a quarter so north points right: columns run south to north, rows west to east. */
export function cutFillImage(): CutFillImage {
  const width = PAD.y1 - PAD.y0, height = PAD.x1 - PAD.x0, pixels = new Uint8ClampedArray(width * height * 4), colour: Rgb = [0, 0, 0];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const x = PAD.x0 + row + 0.5, y = PAD.y0 + col + 0.5;
      cutFillColour(sample(x, y).z - designLevel(x, y), colour);
      const o = (row * width + col) * 4;
      pixels[o] = colour[0];
      pixels[o + 1] = colour[1];
      pixels[o + 2] = colour[2];
      pixels[o + 3] = 255;
    }
  }
  return { pixels, width, height };
}

export type CutFillGrid = { columns: number; rows: number; diff: Float32Array };

/** Mean cut (+) or fill (−) per `cell`-metre square of the pad, in cutFillImage's orientation. */
export function cutFillGrid(cell: number): CutFillGrid {
  const columns = Math.floor((PAD.y1 - PAD.y0) / cell), rows = Math.floor((PAD.x1 - PAD.x0) / cell), diff = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let sum = 0;
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          const x = PAD.x0 + (row + 0.25 + a * 0.5) * cell, y = PAD.y0 + (col + 0.25 + b * 0.5) * cell;
          sum += sample(x, y).z - designLevel(x, y);
        }
      }
      diff[row * columns + col] = sum / 4;
    }
  }
  return { columns, rows, diff };
}

/** Heights on an `nx` × `ny` grid from (x0, y0), row-major with rows running north. */
export function heightGrid(x0: number, y0: number, step: number, nx: number, ny: number) {
  const grid = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) grid[j * nx + i] = sample(x0 + i * step, y0 + j * step).z;
  return grid;
}

const CASES: readonly (readonly number[])[] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [0, 3], []];

/**
 * Marching squares over a height grid. Returns segments as flat (x1, y1, x2, y2) runs in grid units,
 * y running north; every `index`-th metre of contour lands in `major`.
 */
export function contourSegments(grid: Float32Array, nx: number, ny: number, interval: number, index: number) {
  const minor: number[] = [], major: number[] = [], edge = new Float64Array(8);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const z00 = grid[j * nx + i], z10 = grid[j * nx + i + 1], z11 = grid[(j + 1) * nx + i + 1], z01 = grid[(j + 1) * nx + i];
      const lo = Math.min(z00, z10, z11, z01), hi = Math.max(z00, z10, z11, z01);
      for (let level = Math.ceil(lo / interval) * interval; level <= hi; level += interval) {
        const segs = CASES[(z00 > level ? 1 : 0) | (z10 > level ? 2 : 0) | (z11 > level ? 4 : 0) | (z01 > level ? 8 : 0)];
        if (!segs.length) continue;
        edge[0] = i + (level - z00) / (z10 - z00);
        edge[1] = j;
        edge[2] = i + 1;
        edge[3] = j + (level - z10) / (z11 - z10);
        edge[4] = i + 1 - (level - z11) / (z01 - z11);
        edge[5] = j + 1;
        edge[6] = i;
        edge[7] = j + 1 - (level - z01) / (z00 - z01);
        const out = Math.abs(level / index - Math.round(level / index)) < 1e-6 ? major : minor;
        for (let s = 0; s < segs.length; s += 2) out.push(edge[segs[s] * 2], edge[segs[s] * 2 + 1], edge[segs[s + 1] * 2], edge[segs[s + 1] * 2 + 1]);
      }
    }
  }
  return { minor: Float32Array.from(minor), major: Float32Array.from(major) };
}

/** A dark hypsometric tint with hillshade, north-up, as RGBA. Holes (non-finite heights) are left as ground. */
export function tintPixels(grid: Float32Array, nx: number, ny: number, step: number) {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < grid.length; k++) {
    if (!Number.isFinite(grid[k])) continue;
    lo = Math.min(lo, grid[k]);
    hi = Math.max(hi, grid[k]);
  }
  const out = new Uint8ClampedArray(nx * ny * 4), colour: Rgb = [0, 0, 0];
  const at = (i: number, j: number, fallback: number) => {
    const v = grid[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
    return Number.isFinite(v) ? v : fallback;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const z = grid[j * nx + i], o = ((ny - 1 - j) * nx + i) * 4;
      out[o + 3] = 255;
      if (!Number.isFinite(z)) {
        [out[o], out[o + 1], out[o + 2]] = [14, 12, 10];
        continue;
      }
      const b = 0.2 + 0.22 * shade((at(i + 1, j, z) - at(i - 1, j, z)) / (2 * step), (at(i, j + 1, z) - at(i, j - 1, z)) / (2 * step));
      rampColour((z - lo) / (hi - lo || 1), colour);
      out[o] = colour[0] * b;
      out[o + 1] = colour[1] * b;
      out[o + 2] = colour[2] * b;
    }
  }
  return out;
}

export type ContourRequest = { x0: number; x1: number; y0: number; y1: number; step: number; interval: number; index: number; tint: boolean };
export type Contours = { nx: number; ny: number; minor: Float32Array; major: Float32Array; tint: Uint8ClampedArray | null };

export function contours({ x0, x1, y0, y1, step, interval, index, tint }: ContourRequest): Contours {
  const nx = Math.round((x1 - x0) / step) + 1, ny = Math.round((y1 - y0) / step) + 1;
  const grid = heightGrid(x0, y0, step, nx, ny);
  const { minor, major } = contourSegments(grid, nx, ny, interval, index);
  return { nx, ny, minor, major, tint: tint ? tintPixels(grid, nx, ny, step) : null };
}

/** Distance along a west-to-east line at northing `y`, against ground height. */
export function profile(xa: number, xb: number, y: number, step: number): [number, number][] {
  const points: [number, number][] = [];
  for (let d = 0; d <= xb - xa; d += step) points.push([d, sample(xa + d, y).z]);
  return points;
}

export type ChainageMark = { distance: number; x: number; y: number; normalX: number; normalY: number };

/** A mark every `every` metres along a polyline, with the unit normal to its left. */
export function chainageMarks(line: readonly (readonly [number, number])[], every: number): ChainageMark[] {
  const marks: ChainageMark[] = [];
  let travelled = 0, next = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1], length = Math.hypot(bx - ax, by - ay);
    const ux = (bx - ax) / length, uy = (by - ay) / length;
    while (next <= travelled + length) {
      const t = next - travelled;
      marks.push({ distance: next, x: ax + ux * t, y: ay + uy * t, normalX: -uy, normalY: ux });
      next += every;
    }
    travelled += length;
  }
  return marks;
}
