// Saved measurements as CSV, DXF in the survey's own coordinates, KML and GeoJSON: what Propeller (outline as DXF or
// KML, values in CSV reports) and Virtual Surveyor (CSV or Shapefile) offer, with GeoJSON in place of the Shapefile.
// Pure, so it runs under `node --test`; the caller samples heights and projects.

import type { GeoJsonGeometry, Measurement } from "@/lib/api/orblodeSvc";
import { methodFromParams, metricsOf, resultForKind } from "./calc.ts";
import { dxfLayer } from "./profile.ts";
import { toCsv } from "../reports/index.ts";
import { styleOf } from "./style.ts";

export type ExportFormat = "csv" | "dxf" | "kml" | "geojson";

export const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "csv", label: "CSV · values, for spreadsheets" },
  { format: "dxf", label: "DXF · 3D outline in the survey's coordinates" },
  { format: "kml", label: "KML · outline and values, for Google Earth" },
  { format: "geojson", label: "GeoJSON · outline and values, for GIS" },
];

export const EXPORT_MIME: Record<ExportFormat, string> = {
  csv: "text/csv",
  dxf: "application/dxf",
  kml: "application/vnd.google-earth.kml+xml",
  geojson: "application/geo+json",
};

export interface ExportItem {
  id: string;
  name: string;
  kind: string;
  folder: string | null;
  material: string | null;
  densityTM3: number | null;
  metrics: Record<string, number>;
  /** "computed" numbers came from a compute; "plan" ones were measured flat from the outline. */
  basis: "computed" | "plan";
  computedAt: number | null;
  baseMethod: string | null;
  stroke: string;
  geometry: GeoJsonGeometry;
}

export function isExportable(m: Pick<Measurement, "draft" | "geometry">): boolean {
  return m.draft !== true && !!m.geometry;
}

/** `planStats` are the outline's plan values, used when nothing has been computed for the measurement's kind. */
// A stockpile's or volume's cut, fill and net only restate its volume, so the inspector leaves them out too.
const RESTATED_FOR_VOLUMES = ["cut_volume_m3", "fill_volume_m3", "net_change_m3"];

export function exportItem(m: Measurement, planStats: Record<string, number>): ExportItem {
  const computed = metricsOf(resultForKind(m));
  const hasComputed = Object.keys(computed).length > 0;
  if (m.kind === "stockpile" || m.kind === "volume") for (const key of RESTATED_FOR_VOLUMES) delete computed[key];
  const material = (m.params?.material ?? null) as { name?: unknown; density_t_m3?: unknown } | null;
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    folder: m.folder || null,
    material: typeof material?.name === "string" && material.name ? material.name : null,
    densityTM3: typeof material?.density_t_m3 === "number" ? material.density_t_m3 : null,
    metrics: hasComputed ? { ...planStats, ...computed } : planStats,
    basis: hasComputed ? "computed" : "plan",
    computedAt: hasComputed && typeof m.computed_at === "number" ? m.computed_at : null,
    baseMethod: methodFromParams(m.params)?.method ?? null,
    stroke: styleOf(m.params).stroke,
    geometry: m.geometry!,
  };
}

const METRIC_COLUMNS: [key: string, label: string][] = [
  ["volume_m3", "Volume (m³)"],
  ["adjusted_volume_m3", "Adjusted volume (m³)"],
  ["tonnage_t", "Tonnage (t)"],
  ["value", "Value"],
  ["cut_volume_m3", "Cut (m³)"],
  ["fill_volume_m3", "Fill (m³)"],
  ["net_change_m3", "Net change (m³)"],
  ["area_m2", "Area (m²)"],
  ["perimeter_m", "Perimeter (m)"],
  ["length_m", "Length (m)"],
];

const round = (v: number, digits: number) => Number(v.toFixed(digits));

function attributes(item: ExportItem, surveyDate: string): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {
    name: item.name,
    kind: item.kind,
    survey_date: surveyDate,
    folder: item.folder,
    material: item.material,
    density_t_m3: item.densityTM3,
  };
  for (const [key] of METRIC_COLUMNS) {
    const v = item.metrics[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? round(v, 3) : null;
  }
  out.basis = item.basis;
  out.computed_at = item.computedAt === null ? null : new Date(item.computedAt).toISOString();
  out.base_method = item.baseMethod;
  return out;
}

const CSV_HEAD = [
  "name",
  "kind",
  "survey_date",
  "folder",
  "material",
  "density_t_m3",
  ...METRIC_COLUMNS.map(([key]) => key),
  "basis",
  "computed_at",
  "base_method",
];

export function measurementsCsv(items: ExportItem[], surveyDate: string): string {
  return toCsv([CSV_HEAD, ...items.map((item) => {
    const row = attributes(item, surveyDate);
    return CSV_HEAD.map((k) => row[k]);
  })]);
}

const roundPosition = (p: unknown): unknown =>
  Array.isArray(p) && typeof p[0] === "number"
    ? (p as number[]).map((v, i) => (i < 2 ? round(v, 9) : round(v, 3)))
    : Array.isArray(p)
      ? p.map(roundPosition)
      : p;

/** RFC 7946: WGS 84 longitude and latitude as saved, the values as feature properties. */
export function measurementsGeoJson(items: ExportItem[], surveyDate: string): string {
  return (
    JSON.stringify(
      {
        type: "FeatureCollection",
        features: items.map((item) => ({
          type: "Feature",
          id: item.id,
          properties: attributes(item, surveyDate),
          geometry: { type: item.geometry.type, coordinates: roundPosition(item.geometry.coordinates) },
        })),
      },
      null,
      2
    ) + "\n"
  );
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** "#C97A4E" → KML's aabbggrr. */
export function kmlColour(hex: string, alpha: number): string {
  let h = hex.replace(/^#/, "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const rr = h.slice(0, 2) || "00";
  const gg = h.slice(2, 4) || "00";
  const bb = h.slice(4, 6) || "00";
  const aa = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${aa}${bb}${gg}${rr}`.toLowerCase();
}

const kmlCoords = (ring: number[][]) => ring.map((p) => `${round(p[0], 9)},${round(p[1], 9)},0`).join(" ");

function kmlGeometry(g: GeoJsonGeometry): string {
  const c = g.coordinates;
  switch (g.type) {
    case "Point": {
      const p = c as number[];
      return `<Point><coordinates>${round(p[0], 9)},${round(p[1], 9)},0</coordinates></Point>`;
    }
    case "LineString":
      return `<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${kmlCoords(c as number[][])}</coordinates></LineString>`;
    case "Polygon": {
      const [outer, ...holes] = c as number[][][];
      const inner = holes.map((r) => `<innerBoundaryIs><LinearRing><coordinates>${kmlCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join("");
      return `<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${kmlCoords(outer)}</coordinates></LinearRing></outerBoundaryIs>${inner}</Polygon>`;
    }
    default:
      return "";
  }
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  kind: "Type",
  survey_date: "Survey",
  folder: "Folder",
  material: "Material",
  density_t_m3: "Density (t/m³)",
  basis: "Values from",
  computed_at: "Computed",
  base_method: "Base method",
  ...Object.fromEntries(METRIC_COLUMNS),
};

/** Outlines clamped to the ground, so no heights are needed; each value is a named ExtendedData field. */
export function measurementsKml(items: ExportItem[], title: string, surveyDate: string): string {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">', "<Document>", `<name>${xml(title)}</name>`];
  items.forEach((item, i) => {
    out.push(
      `<Style id="m${i}"><LineStyle><color>${kmlColour(item.stroke, 1)}</color><width>2</width></LineStyle><PolyStyle><color>${kmlColour(item.stroke, 0.25)}</color></PolyStyle><IconStyle><color>${kmlColour(item.stroke, 1)}</color></IconStyle></Style>`
    );
  });
  items.forEach((item, i) => {
    const data = Object.entries(attributes(item, surveyDate))
      .filter(([k, v]) => k !== "name" && v !== null && v !== "")
      .map(([k, v]) => `<Data name="${xml(k)}"><displayName>${xml(ATTRIBUTE_LABELS[k] ?? k)}</displayName><value>${xml(String(v))}</value></Data>`)
      .join("");
    out.push(`<Placemark><name>${xml(item.name)}</name><styleUrl>#m${i}</styleUrl><ExtendedData>${data}</ExtendedData>${kmlGeometry(item.geometry)}</Placemark>`);
  });
  out.push("</Document>", "</kml>");
  return out.join("\n") + "\n";
}

/** A position in the survey's working CRS: easting, northing and, when it was sampled, the surface height. */
export type ProjectedPosition = [east: number, north: number, z: number | null];

export type ProjectFn = (lonLat: [number, number]) => [number, number];

/** Surface heights per ring and vertex of each measurement, by id; missing ones leave that outline flat. */
export type OutlineHeights = ReadonlyMap<string, (number | null)[][]>;

function ringsOf(g: GeoJsonGeometry): number[][][] {
  switch (g.type) {
    case "Point":
      return [[g.coordinates as number[]]];
    case "LineString":
      return [g.coordinates as number[][]];
    case "Polygon":
      return g.coordinates as number[][][];
    default:
      return [];
  }
}

/** The headline value written under a measurement's name in the drawing. */
function headline(item: ExportItem): string | null {
  for (const [key, unit] of [
    ["volume_m3", "m3"],
    ["net_change_m3", "m3 net"],
    ["area_m2", "m2"],
    ["length_m", "m"],
  ] as const) {
    const v = item.metrics[key];
    if (typeof v === "number" && Number.isFinite(v)) return `${v.toFixed(1)} ${unit}`;
  }
  return null;
}

/** DXF R12 text is single-byte: anything else is written as \U+XXXX, which AutoCAD reads back. */
const dxfText = (s: string) => s.replace(/[^\x20-\x7E]/g, (ch) => `\\U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);

/**
 * An AutoCAD R12 DXF in the survey's working CRS: each outline a polyline (closed for a polygon, 3D where every vertex
 * has a height), each point a POINT, on a layer named after the measurement, with its name and headline value as text.
 */
export function measurementsDxf(items: ExportItem[], project: ProjectFn, heights: OutlineHeights = new Map()): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const n = (v: number) => v.toFixed(4);
  for (const item of items) {
    const layer = dxfLayer(item.name);
    const rings = ringsOf(item.geometry);
    const ringHeights = heights.get(item.id);
    const projected: ProjectedPosition[][] = rings.map((ring, r) =>
      ring.map((p, k) => {
        const [e, nn] = project([p[0], p[1]]);
        const z = ringHeights?.[r]?.[k];
        return [e, nn, typeof z === "number" && Number.isFinite(z) ? z : null];
      })
    );
    const all = projected.flat();
    if (all.length === 0 || all.some(([e, nn]) => !Number.isFinite(e) || !Number.isFinite(nn))) continue;

    if (item.geometry.type === "Point") {
      const [e, nn, z] = all[0];
      out.push("0", "POINT", "8", layer, "10", n(e), "20", n(nn), "30", n(z ?? 0));
    } else {
      const closed = item.geometry.type === "Polygon";
      for (const ring of projected) {
        const vertices = closed && ring.length > 1 && samePlace(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
        if (vertices.length < 2) continue;
        const threeD = vertices.every((v) => v[2] !== null);
        out.push("0", "POLYLINE", "8", layer, "66", "1", "70", String((closed ? 1 : 0) + (threeD ? 8 : 0)), "10", "0", "20", "0", "30", "0");
        for (const [e, nn, z] of vertices) {
          out.push("0", "VERTEX", "8", layer, "10", n(e), "20", n(nn), "30", n(threeD ? (z as number) : 0));
          if (threeD) out.push("70", "32");
        }
        out.push("0", "SEQEND", "8", layer);
      }
    }

    const minE = Math.min(...all.map((p) => p[0]));
    const maxE = Math.max(...all.map((p) => p[0]));
    const minN = Math.min(...all.map((p) => p[1]));
    const maxN = Math.max(...all.map((p) => p[1]));
    const height = Math.min(5, Math.max(0.25, Math.hypot(maxE - minE, maxN - minN) * 0.03));
    const zs = all.map((p) => p[2]).filter((z): z is number => z !== null);
    const z = zs.length > 0 ? Math.max(...zs) : 0;
    const cx = (minE + maxE) / 2;
    const cy = (minN + maxN) / 2;
    const lines = [item.name, headline(item)].filter((s): s is string => !!s);
    lines.forEach((text, i) => {
      const y = cy + (lines.length === 1 ? 0 : (0.75 - i * 1.5) * height);
      out.push("0", "TEXT", "8", layer, "10", n(cx), "20", n(y), "30", n(z), "40", n(height), "1", dxfText(text), "72", "1", "11", n(cx), "21", n(y), "31", n(z));
    });
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}

const samePlace = (a: ProjectedPosition, b: ProjectedPosition) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/**
 * Heights at a ring's vertices from a cross-section along it: orblode-svc puts a station on every vertex (two closer
 * than its minimum gap share one), so each vertex takes the station nearest its chainage.
 */
export function vertexHeights(verticesM: number[], distanceM: number[], z: (number | null)[] | undefined): (number | null)[] {
  if (!z) return verticesM.map(() => null);
  return verticesM.map((d) => {
    let best = -1;
    let gap = Infinity;
    for (let i = 0; i < distanceM.length; i++) {
      const g = Math.abs(distanceM[i] - d);
      if (g < gap) {
        gap = g;
        best = i;
      }
    }
    const h = best >= 0 && gap < 0.05 ? z[best] : null;
    return typeof h === "number" && Number.isFinite(h) ? h : null;
  });
}

export function fileStem(name: string, fallback = "measurement"): string {
  return name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || fallback;
}
