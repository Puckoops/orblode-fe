import { clamp } from "./math.ts";

const WEB_MERCATOR_EQUATOR = 156543.03392804097;

/** The widest image the browser will read for a preview; a DSM needs an overview at least this small. */
export const MAX_READ_WIDTH = 4096;

/** Fractional XYZ tile coordinates (top-left origin) of a WGS 84 position at zoom `z`. */
export function tileOf(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n];
}

export type TileBounds = { z: number; x0: number; x1: number; y0: number; y1: number };

/**
 * The zoom whose pixels are about half a grid cell at this latitude, inside the layer's zoom range,
 * stepped down until the bounds need at most `maxTiles` tiles.
 */
export function tileBounds(west: number, south: number, east: number, north: number, cell: number, minZoom: number, maxZoom: number, maxTiles = 64): TileBounds {
  const lat = (south + north) / 2;
  let z = clamp(Math.ceil(Math.log2((WEB_MERCATOR_EQUATOR * Math.cos((lat * Math.PI) / 180)) / (cell / 2))), minZoom, maxZoom);
  for (;;) {
    const [ax, ay] = tileOf(west, north, z), [bx, by] = tileOf(east, south, z);
    const bounds = { z, x0: Math.floor(ax), x1: Math.floor(bx), y0: Math.floor(ay), y1: Math.floor(by) };
    if ((bounds.x1 - bounds.x0 + 1) * (bounds.y1 - bounds.y0 + 1) <= maxTiles || z <= minZoom) return bounds;
    z--;
  }
}

export const fillTemplate = (template: string, z: number, x: number, y: number) =>
  template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/** Whether a raster value is a hole: the file's nodata value, or the sentinels GDAL writers commonly leave. */
export const isNoData = (v: number, nodata: number | null) =>
  !Number.isFinite(v) || (nodata !== null && Math.abs(v - nodata) < 1e-6) || v < -1e4 || v > 1e5;

/** The value below which `fraction` of the finite values fall. */
export function quantile(values: Float32Array, fraction: number) {
  const finite = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return NaN;
  return finite[Math.min(finite.length - 1, Math.max(0, Math.round(fraction * (finite.length - 1))))];
}

const STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 50];

/** A contour interval that draws about `lines` contours across `relief` metres. */
export function contourInterval(relief: number, lines = 30) {
  const ideal = relief / lines;
  return STEPS.find((s) => s >= ideal) ?? STEPS[STEPS.length - 1];
}
