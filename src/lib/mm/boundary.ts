import { fromUtm } from "./utm.ts";

// Lease boundaries arrive as KML, KMZ, shapefile, DXF, GeoJSON or a CSV of corner pillars. KML, KMZ and
// shapefiles are read in the browser by Cesium and shpjs; this reads the rest and turns every format into
// one GeoJSON Polygon or MultiPolygon in WGS 84, which orblode-svc then checks.

export type Ring = [number, number][];

export interface BoundaryGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export interface ParsedBoundary {
  geometry: BoundaryGeometry;
  pillars: number;
}

/** How a CSV or DXF names its coordinates when they are not longitude and latitude. */
export interface GridCRS {
  zone: number;
  north: boolean;
}

export class BoundaryError extends Error {}

const closed = (ring: Ring): Ring => {
  if (ring.length === 0) return ring;
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a];
};

const looksLonLat = (ring: Ring) => ring.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);

function toLonLat(ring: Ring, grid?: GridCRS): Ring {
  if (looksLonLat(ring)) return ring;
  if (!grid) throw new BoundaryError("The coordinates are eastings and northings: choose their UTM zone.");
  return ring.map(([e, n]) => {
    const p = fromUtm(e, n, grid.zone, grid.north);
    return [p.lon, p.lat];
  });
}

function polygon(rings: Ring[], grid?: GridCRS): ParsedBoundary {
  const usable = rings.filter((r) => r.length >= 3).map((r) => closed(toLonLat(r, grid)));
  if (usable.length === 0) throw new BoundaryError("No closed outline of three or more corners was found.");
  const pillars = usable.reduce((n, r) => n + r.length - 1, 0);
  return usable.length === 1
    ? { geometry: { type: "Polygon", coordinates: [usable[0]] }, pillars }
    : { geometry: { type: "MultiPolygon", coordinates: usable.map((r) => [r]) }, pillars };
}

const HEADER_X = /^(lon|long|longitude|x|easting|east|e)$/i;
const HEADER_Y = /^(lat|latitude|y|northing|north|n)$/i;

/** A CSV of corner pillars, in order: pillar,longitude,latitude or pillar,easting,northing, with or without
 * a header row. Columns are found by their header names, else the last two numeric columns are taken. */
export function parsePillarsCsv(text: string, grid?: GridCRS): ParsedBoundary {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/[,;\t]/).map((c) => c.trim()));
  if (rows.length === 0) throw new BoundaryError("The file is empty.");
  let xi = -1;
  let yi = -1;
  const header = rows[0];
  header.forEach((h, i) => {
    if (xi < 0 && HEADER_X.test(h)) xi = i;
    if (yi < 0 && HEADER_Y.test(h)) yi = i;
  });
  const data = xi >= 0 && yi >= 0 ? rows.slice(1) : rows.filter((r) => r.some((c) => c !== "" && !Number.isNaN(Number(c))));
  const ring: Ring = [];
  for (const r of data) {
    let x: number;
    let y: number;
    if (xi >= 0 && yi >= 0) {
      x = Number(r[xi]);
      y = Number(r[yi]);
    } else {
      const nums = r.map(Number).filter((v, i) => r[i] !== "" && !Number.isNaN(v));
      if (nums.length < 2) continue;
      [x, y] = nums.slice(-2);
    }
    if (Number.isFinite(x) && Number.isFinite(y)) ring.push([x, y]);
  }
  if (ring.length < 3) throw new BoundaryError("Fewer than three pillars could be read.");
  return polygon([ring], grid);
}

/** Closed LWPOLYLINE and POLYLINE outlines of an ASCII DXF. */
export function parseDxf(text: string, grid?: GridCRS): ParsedBoundary {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i].trim()), lines[i + 1].trim()]);
  const rings: Ring[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code !== 0) continue;
    if (value === "LWPOLYLINE") {
      const ring: Ring = [];
      let flags = 0;
      let x: number | null = null;
      for (i++; i < pairs.length && pairs[i][0] !== 0; i++) {
        const [c, v] = pairs[i];
        if (c === 70) flags = Number(v);
        if (c === 10) x = Number(v);
        if (c === 20 && x !== null) {
          ring.push([x, Number(v)]);
          x = null;
        }
      }
      i--;
      if (flags & 1 || (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])) rings.push(ring);
    } else if (value === "POLYLINE") {
      const ring: Ring = [];
      let flags = 0;
      for (i++; i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === "VERTEX"); i++) if (pairs[i][0] === 70) flags = Number(pairs[i][1]);
      while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] === "VERTEX") {
        let x: number | null = null;
        let y: number | null = null;
        for (i++; i < pairs.length && pairs[i][0] !== 0; i++) {
          if (pairs[i][0] === 10) x = Number(pairs[i][1]);
          if (pairs[i][0] === 20) y = Number(pairs[i][1]);
        }
        if (x !== null && y !== null) ring.push([x, y]);
      }
      if (flags & 1) rings.push(ring);
    }
  }
  if (rings.length === 0) throw new BoundaryError("No closed polyline was found in the DXF.");
  return polygon(rings, grid);
}

/** The polygons of a GeoJSON geometry, Feature or FeatureCollection. */
export function parseGeoJson(text: string): ParsedBoundary {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoundaryError("The file is not valid JSON.");
  }
  const rings: Ring[] = [];
  const visit = (g: unknown): void => {
    if (!g || typeof g !== "object") return;
    const o = g as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] };
    if (o.type === "FeatureCollection") o.features?.forEach(visit);
    else if (o.type === "Feature") visit(o.geometry);
    else if (o.type === "GeometryCollection") o.geometries?.forEach(visit);
    else if (o.type === "Polygon") rings.push(((o.coordinates as Ring[]) ?? [])[0]?.map(([x, y]) => [x, y]) ?? []);
    else if (o.type === "MultiPolygon") (o.coordinates as Ring[][]).forEach((p) => rings.push(p[0].map(([x, y]) => [x, y])));
  };
  visit(value);
  if (rings.length === 0) throw new BoundaryError("The GeoJSON holds no polygon.");
  return polygon(rings);
}

/** Polygons as Cesium or shpjs read them: outer rings of lon/lat. */
export function fromRings(rings: Ring[]): ParsedBoundary {
  return polygon(rings);
}

const EARTH_R = 6371008.8;

/** Ground area of a ring in square metres, spherical excess on the WGS 84 mean radius. */
export function ringAreaM2(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += ((x2 - x1) * Math.PI) / 180 * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * EARTH_R * EARTH_R) / 2);
}

export function boundaryAreaM2(g: BoundaryGeometry): number {
  if (g.type === "Polygon") return ringAreaM2((g.coordinates as Ring[])[0]);
  return (g.coordinates as Ring[][]).reduce((sum, p) => sum + ringAreaM2(p[0]), 0);
}

/** The polygons of a KML: each Polygon's outer boundary. */
export function parseKml(text: string): ParsedBoundary {
  const rings: Ring[] = [];
  const polygons = text.match(/<(?:\w+:)?Polygon\b[\s\S]*?<\/(?:\w+:)?Polygon>/g) ?? [];
  for (const p of polygons) {
    const outer = p.match(/<(?:\w+:)?outerBoundaryIs\b[\s\S]*?<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/);
    if (!outer) continue;
    const ring = outer[1]
      .trim()
      .split(/\s+/)
      .map((t) => t.split(",").map(Number))
      .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
      .map((c) => [c[0], c[1]] as [number, number]);
    if (ring.length >= 3) rings.push(ring);
  }
  if (rings.length === 0) {
    const line = text.match(/<(?:\w+:)?LinearRing\b[\s\S]*?<(?:\w+:)?coordinates>([\s\S]*?)<\/(?:\w+:)?coordinates>/);
    if (line) return parseKml(`<Polygon><outerBoundaryIs><coordinates>${line[1]}</coordinates></outerBoundaryIs></Polygon>`);
    throw new BoundaryError("The KML holds no polygon.");
  }
  return polygon(rings);
}
