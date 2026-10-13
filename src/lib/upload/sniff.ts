import type { FileRole } from "./planner.ts";
import { readRasterHeader } from "./rasterRole.ts";

export const SNIFF_BYTES = 64 * 1024;

const GEOJSON_TYPES = new Set([
  "FeatureCollection",
  "Feature",
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** "EPSG:28356" from the ways GeoJSON writers name a CRS: `EPSG:28356`, `urn:ogc:def:crs:EPSG::28356`,
 * `http://www.opengis.net/def/crs/EPSG/0/28356`, or OGC's CRS84 (WGS 84 in lon/lat order). */
export function epsgFromCrsName(name: string): string | null {
  if (/crs:?84$/i.test(name.trim())) return "EPSG:4326";
  const m = /epsg(?::+|\/[^/]*\/|:[\d.]*:)(\d+)$/i.exec(name.trim());
  return m ? `EPSG:${m[1]}` : null;
}

function epsgFromCrsMember(crs: unknown): string | null {
  if (!crs || typeof crs !== "object") return null;
  const props = (crs as { properties?: Record<string, unknown> }).properties ?? {};
  if (typeof props.name === "string") return epsgFromCrsName(props.name);
  if (typeof props.code === "number" || typeof props.code === "string") return `EPSG:${props.code}`;
  return null;
}

interface TopLevel {
  type?: string;
  /** The raw `crs` value; undefined when the text has no top-level `crs`. */
  crs?: unknown;
}

/** Index of the quote closing the string that opens at `from`, or -1 when the text ends first. */
function stringEnd(text: string, from: number): number {
  for (let j = from + 1; j < text.length; j++) {
    if (text[j] === "\\") j++;
    else if (text[j] === '"') return j;
  }
  return -1;
}

/** Index just past the object or array that opens at `from`, or -1 when the text ends first. */
function blockEnd(text: string, from: number): number {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '"') {
      j = stringEnd(text, j);
      if (j < 0) return -1;
    } else if (c === "{" || c === "[") depth++;
    else if ((c === "}" || c === "]") && --depth === 0) return j + 1;
  }
  return -1;
}

const skipSpace = (text: string, from: number) => {
  let j = from;
  while (j < text.length && /\s/.test(text[j])) j++;
  return j;
};

/** The top-level `type` and `crs` members of JSON text that may be cut off part-way. */
function scanTopLevel(text: string): TopLevel {
  const out: TopLevel = {};
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c !== '"') {
      if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") depth--;
      i++;
      continue;
    }
    const end = stringEnd(text, i);
    if (end < 0) break;
    const colon = skipSpace(text, end + 1);
    if (depth !== 1 || text[colon] !== ":") {
      i = end + 1;
      continue;
    }
    const key = text.slice(i + 1, end);
    const v = skipSpace(text, colon + 1);
    i = v;
    if (key === "type" && text[v] === '"') {
      const e = stringEnd(text, v);
      if (e < 0) break;
      out.type = text.slice(v + 1, e);
      i = e + 1;
    } else if (key === "crs" && text.startsWith("null", v)) {
      out.crs = null;
    } else if (key === "crs" && text[v] === "{") {
      const e = blockEnd(text, v);
      if (e < 0) break;
      try {
        out.crs = JSON.parse(text.slice(v, e));
      } catch {
        out.crs = null;
      }
      i = e;
    }
  }
  return out;
}

/** The CRS a GeoJSON file states in the first 64 KB, else EPSG:4326 (GeoJSON's default); null when the text isn't GeoJSON or names a CRS no EPSG code matches. */
export function geoJsonCrs(text: string): string | null {
  const top = scanTopLevel(text);
  if (top.type !== undefined && !GEOJSON_TYPES.has(top.type)) return null;
  if (top.crs === undefined || top.crs === null) return "EPSG:4326";
  return epsgFromCrsMember(top.crs);
}

export interface QuickRead {
  role: FileRole | null;
  /** The CRS the file's start names; preliminary until the server reads the whole header. */
  crs: string | null;
}

/** A quick look at the start of a file in the browser: a GeoTIFF's bands and GeoKeys, a GeoJSON's `crs`, KML's WGS 84. */
export async function quickRead(file: File): Promise<QuickRead> {
  switch (ext(file.name)) {
    case "tif":
    case "tiff": {
      const header = await readRasterHeader(file);
      return { role: header?.role ?? null, crs: header?.crs ?? null };
    }
    case "geojson":
    case "json":
      try {
        return { role: null, crs: geoJsonCrs(await file.slice(0, SNIFF_BYTES).text()) };
      } catch {
        return { role: null, crs: null };
      }
    case "kml":
      return { role: null, crs: "EPSG:4326" };
    default:
      return { role: null, crs: null };
  }
}
