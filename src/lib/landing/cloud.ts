import { clamp, lerp } from "./math.ts";
import { hash2 } from "./noise.ts";
import { BASEMAP_EXTENT, EXTENT, PILES, groundColour, rampColour, sample, shade, type Material, type Rgb } from "./terrain.ts";

export type CloudDetail = "full" | "light";
export type Channels = { r: Uint8Array; g: Uint8Array; b: Uint8Array };

/**
 * The sample site as parallel arrays of points. `cell` is each point's grid spacing, which sets how
 * large it is drawn. Arrays may be longer than `count`; only the first `count` entries are points.
 */
export type PointCloud = {
  count: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  cell: Float32Array;
  photo: Channels;
  elevation: Channels;
  zmin: number;
  zmax: number;
};

const channels = (n: number): Channels => ({ r: new Uint8Array(n), g: new Uint8Array(n), b: new Uint8Array(n) });

/**
 * The survey on a regular grid, a denser patch around Stockpile 1 for the close-up, and a dimmer,
 * coarser basemap around the survey. Elevation colours span the survey's heights only.
 */
export function buildCloud(detail: CloudDetail): PointCloud {
  const light = detail === "light";
  const surveyN = light ? 220 : 290, surveyCell = (2 * EXTENT) / (surveyN - 1);
  const patchN = light ? 140 : 190, patchHalf = 70, patchCell = (2 * patchHalf) / (patchN - 1);
  const baseN = light ? 138 : 184, baseCell = (2 * BASEMAP_EXTENT) / (baseN - 1);
  const pile = PILES[0];
  const capacity = surveyN ** 2 + patchN ** 2 + baseN ** 2;
  const cloud: PointCloud = {
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    cell: new Float32Array(capacity),
    photo: channels(capacity),
    elevation: channels(capacity),
    zmin: 0,
    zmax: 0,
  };
  const lit = new Float32Array(capacity);
  const colour: Rgb = [0, 0, 0];
  let n = 0;

  const addGrid = (size: number, cell: number, ox: number, oy: number, skip: ((x: number, y: number) => boolean) | null, dim: number) => {
    const zs = new Float32Array(size * size), materials = new Uint8Array(size * size), piles = new Int8Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const s = sample(ox + i * cell, oy + j * cell), k = j * size + i;
        zs[k] = s.z;
        materials[k] = s.material;
        piles[k] = s.pile;
      }
    }
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = ox + i * cell, y = oy + j * cell;
        if (skip?.(x, y)) continue;
        const k = j * size + i;
        const west = zs[j * size + Math.max(0, i - 1)], east = zs[j * size + Math.min(size - 1, i + 1)];
        const south = zs[Math.max(0, j - 1) * size + i], north = zs[Math.min(size - 1, j + 1) * size + i];
        const hill = shade((east - west) / (2 * cell), (north - south) / (2 * cell));
        groundColour(x, y, materials[k] as Material, piles[k], colour);
        if (dim < 1) {
          const grey = (colour[0] + colour[1] + colour[2]) / 3;
          for (let c = 0; c < 3; c++) colour[c] = lerp(colour[c], grey, 0.4);
        }
        const tone = hill * (0.94 + hash2(i * 7 + 3, j * 13 + 1) * 0.12) * dim;
        cloud.photo.r[n] = clamp(colour[0] * tone * 1.02, 0, 255);
        cloud.photo.g[n] = clamp(colour[1] * tone, 0, 255);
        cloud.photo.b[n] = clamp(colour[2] * tone * 0.95, 0, 255);
        cloud.x[n] = x + (hash2(i, j + 99) - 0.5) * cell * 0.2;
        cloud.y[n] = y + (hash2(i + 51, j) - 0.5) * cell * 0.2;
        cloud.z[n] = zs[k];
        cloud.cell[n] = cell;
        lit[n] = hill * dim;
        n++;
      }
    }
  };

  addGrid(surveyN, surveyCell, -EXTENT, -EXTENT, (x, y) => Math.abs(x - pile.x) < patchHalf && Math.abs(y - pile.y) < patchHalf, 1);
  addGrid(patchN, patchCell, pile.x - patchHalf, pile.y - patchHalf, null, 1);
  const surveyCount = n;
  const inSurvey = EXTENT + baseCell / 2;
  addGrid(baseN, baseCell, -BASEMAP_EXTENT, -BASEMAP_EXTENT, (x, y) => Math.abs(x) <= inSurvey && Math.abs(y) <= inSurvey, 0.5);

  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < surveyCount; i++) {
    zmin = Math.min(zmin, cloud.z[i]);
    zmax = Math.max(zmax, cloud.z[i]);
  }
  for (let i = 0; i < n; i++) {
    rampColour((cloud.z[i] - zmin) / (zmax - zmin), colour);
    const k = (0.72 + 0.3 * lit[i]) * (i < surveyCount ? 1 : 0.45);
    cloud.elevation.r[i] = clamp(colour[0] * k, 0, 255);
    cloud.elevation.g[i] = clamp(colour[1] * k, 0, 255);
    cloud.elevation.b[i] = clamp(colour[2] * k, 0, 255);
  }

  cloud.count = n;
  cloud.zmin = zmin;
  cloud.zmax = zmax;
  return cloud;
}

export const cloudBuffers = (c: PointCloud): ArrayBuffer[] =>
  [c.x, c.y, c.z, c.cell, c.photo.r, c.photo.g, c.photo.b, c.elevation.r, c.elevation.g, c.elevation.b].map((a) => a.buffer as ArrayBuffer);
