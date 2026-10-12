import { fromUrl, type GeoTIFF } from "geotiff";
import type { CloudDetail, PointCloud } from "./cloud.ts";
import { clamp } from "./math.ts";
import { contourSegments, cutFillColour, tintPixels, type Contours } from "./maps.ts";
import type { SurveyGrid } from "./grid.ts";
import { MAX_READ_WIDTH, contourInterval, fillTemplate, isNoData, quantile, tileBounds, tileOf } from "./raster.ts";
import type { OrthoSource, SurveySource } from "./site.ts";
import { rampColour, shade, type Rgb } from "./terrain.ts";

/** A real survey ready to draw: the cloud, its grid, and north-up RGBA pictures on that grid. */
export type SurveyScene = {
  cloud: PointCloud;
  grid: SurveyGrid;
  photo: Uint8ClampedArray;
  earlierPhoto: Uint8ClampedArray | null;
  relief: Uint8ClampedArray;
  /** Height change from the earlier survey, coloured: copper where ground was added, blue where it was removed. */
  change: { pixels: Uint8ClampedArray; added: number; removed: number; range: number } | null;
  contours: Contours;
  interval: number;
};


const TILE_CONCURRENCY = 6;

type Proj4 = (from: string, to: string, point: [number, number]) => [number, number];

async function loadProj4(): Promise<Proj4> {
  const m = await import("proj4");
  const mod = m as unknown as { default?: Proj4 };
  return typeof mod.default === "function" ? mod.default : (m as unknown as Proj4);
}

type Dsm = { tiff: GeoTIFF; bbox: number[]; widths: number[]; nodata: number | null };

async function openDsm(url: string): Promise<Dsm> {
  const tiff = await fromUrl(url, { allowFullFile: false });
  const first = await tiff.getImage(0), count = await tiff.getImageCount(), widths: number[] = [];
  for (let i = 0; i < count; i++) widths.push((await tiff.getImage(i)).getWidth());
  return { tiff, bbox: first.getBoundingBox(), widths: widths.sort((a, b) => a - b), nodata: first.getGDALNoData() };
}

/** Heights of `dsm` over `bbox` (its CRS) resampled to nx × ny, read from the coarsest overview that is fine enough. */
async function heightsIn(dsm: Dsm, bbox: number[], nx: number, ny: number) {
  const fullWidth = dsm.bbox[2] - dsm.bbox[0], wanted = (bbox[2] - bbox[0]) / nx;
  let source = dsm.widths[dsm.widths.length - 1];
  for (const w of dsm.widths) {
    source = w;
    if (wanted > fullWidth / w) break;
  }
  if (source * ((bbox[2] - bbox[0]) / fullWidth) > MAX_READ_WIDTH) throw new Error("The DSM has no overview small enough to preview");
  // Nearest, not bilinear: blending a nodata value into its neighbours would invent heights at the survey's edge.
  const result = await dsm.tiff.readRasters({ bbox, width: nx, height: ny, samples: [0], resampleMethod: "nearest", fillValue: NaN });
  const band = (Array.isArray(result) ? result[0] : result) as ArrayLike<number>;
  const z = new Float32Array(nx * ny);
  for (let i = 0; i < z.length; i++) z[i] = isNoData(band[i], dsm.nodata) ? NaN : band[i];
  return z;
}

async function fetchTile(url: string): Promise<ImageData | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } catch {
    return null;
  }
}

/** The orthophoto's colour at each node's longitude and latitude (alpha 0 where the tiles have none). */
async function orthoColours(ortho: OrthoSource, lonLat: Float64Array, cell: number, base: string) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let i = 0; i < lonLat.length; i += 2) {
    west = Math.min(west, lonLat[i]);
    east = Math.max(east, lonLat[i]);
    south = Math.min(south, lonLat[i + 1]);
    north = Math.max(north, lonLat[i + 1]);
  }
  const b = tileBounds(west, south, east, north, cell, ortho.minZoom, ortho.maxZoom);
  const template = new URL(ortho.template, base).href.replace(/%7B/g, "{").replace(/%7D/g, "}");
  const keys: [number, number][] = [];
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) keys.push([x, y]);
  const tiles = new Map<string, ImageData | null>();
  for (let i = 0; i < keys.length; i += TILE_CONCURRENCY) {
    const batch = keys.slice(i, i + TILE_CONCURRENCY);
    const images = await Promise.all(batch.map(([x, y]) => fetchTile(fillTemplate(template, b.z, x, y))));
    batch.forEach(([x, y], k) => tiles.set(`${x}/${y}`, images[k]));
  }
  if (![...tiles.values()].some(Boolean)) return null;
  const out = new Uint8ClampedArray((lonLat.length / 2) * 4);
  for (let n = 0; n < lonLat.length / 2; n++) {
    const [tx, ty] = tileOf(lonLat[n * 2], lonLat[n * 2 + 1], b.z), tile = tiles.get(`${Math.floor(tx)}/${Math.floor(ty)}`);
    if (!tile) continue;
    const px = Math.min(tile.width - 1, Math.floor((tx % 1) * tile.width)), py = Math.min(tile.height - 1, Math.floor((ty % 1) * tile.height));
    const o = (py * tile.width + px) * 4;
    if (tile.data[o + 3] < 128) continue;
    out.set(tile.data.subarray(o, o + 3), n * 4);
    out[n * 4 + 3] = 255;
  }
  return out;
}

const neighbour = (z: Float32Array, nx: number, ny: number, col: number, row: number, fallback: number) => {
  const v = z[clamp(row, 0, ny - 1) * nx + clamp(col, 0, nx - 1)];
  return Number.isFinite(v) ? v : fallback;
};

/**
 * Reads a survey for the landing page: the DSM at about `long` cells across its longer side, the
 * orthophoto's colours on that grid, and the same for the earlier survey when there is one.
 * `base` resolves the source's same-origin paths; `origin` is where site-local metres start.
 */
export async function buildSurveyScene(source: SurveySource, origin: { east: number; north: number }, detail: CloudDetail, base: string): Promise<SurveyScene> {
  const proj4 = await loadProj4();
  const dsm = await openDsm(new URL(source.dsm, base).href);
  const full = dsm.bbox, long = detail === "light" ? 220 : 300;
  const step = Math.max(full[2] - full[0], full[3] - full[1]) / long;
  const nx = Math.max(2, Math.ceil((full[2] - full[0]) / step)), ny = Math.max(2, Math.ceil((full[3] - full[1]) / step));
  const bbox = [full[0], full[3] - ny * step, full[0] + nx * step, full[3]], cellX = step, cellY = step;
  const z = await heightsIn(dsm, bbox, nx, ny);

  const lonLat = new Float64Array(nx * ny * 2);
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const [lon, lat] = proj4(source.projDef, "WGS84", [bbox[0] + (col + 0.5) * cellX, bbox[3] - (row + 0.5) * cellY]);
      lonLat[(row * nx + col) * 2] = lon;
      lonLat[(row * nx + col) * 2 + 1] = lat;
    }
  }
  const [orthoNow, earlierZ] = await Promise.all([
    source.ortho ? orthoColours(source.ortho, lonLat, step, base) : Promise.resolve(null),
    source.earlierDsm ? openDsm(new URL(source.earlierDsm, base).href).then((d) => heightsIn(d, bbox, nx, ny)).catch(() => null) : Promise.resolve(null),
  ]);
  const orthoEarlier = earlierZ && source.earlierOrtho ? await orthoColours(source.earlierOrtho, lonLat, step, base) : null;

  const zlo = quantile(z, 0.02), zhi = quantile(z, 0.98), span = zhi - zlo || 1;
  const count = nx * ny, colour: Rgb = [0, 0, 0];
  const photo = new Uint8ClampedArray(count * 4), relief = new Uint8ClampedArray(count * 4);
  const cloud: PointCloud = {
    count: 0,
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    cell: new Float32Array(count),
    photo: { r: new Uint8Array(count), g: new Uint8Array(count), b: new Uint8Array(count) },
    elevation: { r: new Uint8Array(count), g: new Uint8Array(count), b: new Uint8Array(count) },
    zmin: zlo,
    zmax: zhi,
  };
  let n = 0;
  for (let row = 0; row < ny; row++) {
    for (let col = 0; col < nx; col++) {
      const k = row * nx + col, h = z[k], o = k * 4;
      if (!Number.isFinite(h)) {
        [photo[o], photo[o + 1], photo[o + 2], photo[o + 3]] = [14, 12, 10, 255];
        [relief[o], relief[o + 1], relief[o + 2], relief[o + 3]] = [14, 12, 10, 255];
        continue;
      }
      const hill = shade(
        (neighbour(z, nx, ny, col + 1, row, h) - neighbour(z, nx, ny, col - 1, row, h)) / (2 * cellX),
        (neighbour(z, nx, ny, col, row - 1, h) - neighbour(z, nx, ny, col, row + 1, h)) / (2 * cellY),
      );
      rampColour((h - zlo) / span, colour);
      const r = 0.72 + 0.3 * hill;
      relief.set([colour[0] * r, colour[1] * r, colour[2] * r, 255], o);
      if (orthoNow && orthoNow[o + 3]) {
        const t = 0.82 + 0.22 * hill;
        photo.set([orthoNow[o] * t, orthoNow[o + 1] * t, orthoNow[o + 2] * t, 255], o);
      } else {
        photo.set([colour[0] * r * 0.8, colour[1] * r * 0.8, colour[2] * r * 0.8, 255], o);
      }
      cloud.x[n] = bbox[0] + (col + 0.5) * cellX - origin.east;
      cloud.y[n] = bbox[3] - (row + 0.5) * cellY - origin.north;
      cloud.z[n] = h;
      cloud.cell[n] = step;
      cloud.photo.r[n] = photo[o];
      cloud.photo.g[n] = photo[o + 1];
      cloud.photo.b[n] = photo[o + 2];
      cloud.elevation.r[n] = relief[o];
      cloud.elevation.g[n] = relief[o + 1];
      cloud.elevation.b[n] = relief[o + 2];
      n++;
    }
  }
  cloud.count = n;

  let change: SurveyScene["change"] = null, earlierPhoto: Uint8ClampedArray | null = null;
  if (earlierZ) {
    const diff = new Float32Array(count);
    for (let k = 0; k < count; k++) diff[k] = Number.isFinite(z[k]) && Number.isFinite(earlierZ[k]) ? z[k] - earlierZ[k] : NaN;
    const moved = diff.map((d) => (Math.abs(d) > 0.05 ? Math.abs(d) : NaN));
    const range = clamp(quantile(moved, 0.9) || 0.3, 0.3, 10);
    const pixels = new Uint8ClampedArray(count * 4);
    let added = 0, removed = 0;
    for (let k = 0; k < count; k++) {
      const d = diff[k], o = k * 4;
      if (!Number.isFinite(d)) {
        pixels.set([14, 12, 10, 255], o);
        continue;
      }
      if (d > 0) added += d * cellX * cellY;
      else removed -= d * cellX * cellY;
      cutFillColour((-d * 3) / range, colour);
      pixels.set([colour[0], colour[1], colour[2], 255], o);
    }
    change = { pixels, added, removed, range };
    if (orthoEarlier) {
      earlierPhoto = new Uint8ClampedArray(count * 4);
      for (let k = 0; k < count; k++) {
        const o = k * 4;
        earlierPhoto.set(orthoEarlier[o + 3] ? [orthoEarlier[o], orthoEarlier[o + 1], orthoEarlier[o + 2], 255] : [14, 12, 10, 255], o);
      }
    }
  }

  const northward = new Float32Array(count);
  for (let row = 0; row < ny; row++) northward.set(z.subarray(row * nx, row * nx + nx), (ny - 1 - row) * nx);
  const interval = contourInterval(zhi - zlo);
  const { minor, major } = contourSegments(northward, nx, ny, interval, interval * 5);
  const contours: Contours = { nx, ny, minor, major, tint: tintPixels(northward, nx, ny, step) };

  return {
    cloud,
    grid: { nx, ny, cell: step, x0: bbox[0] - origin.east, y1: bbox[3] - origin.north, z },
    photo,
    earlierPhoto,
    relief,
    change,
    contours,
    interval,
  };
}

export const surveyBuffers = (s: SurveyScene): ArrayBuffer[] =>
  [
    s.cloud.x,
    s.cloud.y,
    s.cloud.z,
    s.cloud.cell,
    s.cloud.photo.r,
    s.cloud.photo.g,
    s.cloud.photo.b,
    s.cloud.elevation.r,
    s.cloud.elevation.g,
    s.cloud.elevation.b,
    s.grid.z,
    s.photo,
    s.relief,
    s.contours.minor,
    s.contours.major,
    ...(s.contours.tint ? [s.contours.tint] : []),
    ...(s.earlierPhoto ? [s.earlierPhoto] : []),
    ...(s.change ? [s.change.pixels] : []),
  ].map((a) => a.buffer as ArrayBuffer);
