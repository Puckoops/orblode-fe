// Cross-sections of a line measurement: the settings it keeps in
// `params.cross_section`, the surfaces asked of orblode-svc's /profile, the
// chart's scales and readouts, and the CSV and DXF exports. Pure, so it runs
// under `node --test`.

import type { ProfileResponse, ProfileSurfaceRequest } from "@/lib/api/orblodeSvc";
import { PROFILE_SERIES } from "./sceneStyle.ts";

export type CompareRef =
  | { type: "survey_terrain"; survey_id: string; surface: "dsm" | "dtm"; color: string }
  | { type: "design"; design_id: string; color: string }
  | { type: "reference_level"; elevation_m: number; color: string };

export interface CrossSectionSettings {
  show: boolean;
  compare: CompareRef[];
}

/** orblode-svc samples up to 8 surfaces, and the survey's own DSM is one. */
export const MAX_COMPARE = 7;

const COLOR = /^#[0-9a-fA-F]{3,8}$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function parseRef(v: unknown): CompareRef | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const color = typeof r.color === "string" && COLOR.test(r.color) ? r.color : PROFILE_SERIES[0];
  if (r.type === "survey_terrain" && typeof r.survey_id === "string" && OBJECT_ID.test(r.survey_id)) {
    return { type: "survey_terrain", survey_id: r.survey_id, surface: r.surface === "dtm" ? "dtm" : "dsm", color };
  }
  if (r.type === "design" && typeof r.design_id === "string" && OBJECT_ID.test(r.design_id)) {
    return { type: "design", design_id: r.design_id, color };
  }
  if (r.type === "reference_level" && typeof r.elevation_m === "number" && Number.isFinite(r.elevation_m)) {
    return { type: "reference_level", elevation_m: r.elevation_m, color };
  }
  return null;
}

/** A line's cross-section settings. Every line shows its chart until it is turned off. */
export function crossSectionOf(params: Record<string, unknown> | null | undefined): CrossSectionSettings {
  const raw = params?.cross_section;
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const compare: CompareRef[] = [];
  for (const item of Array.isArray(r.compare) ? r.compare : []) {
    const ref = parseRef(item);
    if (!ref || compare.some((c) => refKey(c) === refKey(ref))) continue;
    compare.push(ref);
    if (compare.length === MAX_COMPARE) break;
  }
  return { show: typeof r.show === "boolean" ? r.show : true, compare };
}

export function refKey(ref: CompareRef): string {
  switch (ref.type) {
    case "survey_terrain":
      return `survey:${ref.survey_id}:${ref.surface}`;
    case "design":
      return `design:${ref.design_id}`;
    case "reference_level":
      return `rl:${ref.elevation_m}`;
  }
}

/** The first series colour no comparison has yet. */
export function nextSeriesColor(compare: CompareRef[]): string {
  const used = new Set(compare.map((c) => c.color.toLowerCase()));
  return PROFILE_SERIES.find((c) => !used.has(c.toLowerCase())) ?? PROFILE_SERIES[compare.length % PROFILE_SERIES.length];
}

/** What orblode-svc samples: the survey's own DSM first, then each comparison read from a raster. A reference level is drawn here. */
export function profileSurfaces(compare: CompareRef[]): ProfileSurfaceRequest[] {
  const out: ProfileSurfaceRequest[] = [{ type: "survey_terrain", surface: "dsm" }];
  for (const c of compare) {
    if (c.type === "survey_terrain") out.push({ type: "survey_terrain", survey_id: c.survey_id, surface: c.surface });
    else if (c.type === "design") out.push({ type: "design", design_id: c.design_id });
  }
  return out;
}

export interface ProfileSeries {
  key: string;
  color: string;
  /** Height at each station; null where the surface could not be read at all. */
  z: (number | null)[] | null;
  error?: string;
  primary: boolean;
}

/** The chart's series, the survey first. `data` must answer profileSurfaces(compare). */
export function buildSeries(data: ProfileResponse, compare: CompareRef[], primaryColor: string): ProfileSeries[] {
  const first = data.surfaces[0];
  const out: ProfileSeries[] = [
    { key: "survey", color: primaryColor, z: first?.z ?? null, error: first?.error?.message, primary: true },
  ];
  let next = 1;
  for (const c of compare) {
    if (c.type === "reference_level") {
      out.push({ key: refKey(c), color: c.color, z: data.distance_m.map(() => c.elevation_m), primary: false });
      continue;
    }
    const s = data.surfaces[next++];
    out.push({ key: refKey(c), color: c.color, z: s?.z ?? null, error: s?.error?.message, primary: false });
  }
  return out;
}

// ---------------------------------------------------------------- chart

export type Ratio = "fit" | 1 | 2 | 4 | 8;

export interface Domain {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The lowest and highest height any series reaches between chainages d0 and d1. */
export function zExtent(distances: number[], series: ProfileSeries[], d0: number, d1: number): { lo: number; hi: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    if (!s.z) continue;
    for (let i = 0; i < distances.length; i++) {
      const z = s.z[i];
      if (z === null || z === undefined || distances[i] < d0 || distances[i] > d1) continue;
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
  }
  return lo <= hi ? { lo, hi } : null;
}

/**
 * The chainage and height shown in a plot of the given size. "fit" stretches
 * the heights to fill it; a ratio 1:n draws a metre of height n times as tall
 * as a metre of chainage, widening the chainage around the window when the
 * heights would not fit otherwise.
 */
export function chartDomain(
  window: { d0: number; d1: number },
  extent: { lo: number; hi: number },
  plot: { width: number; height: number },
  ratio: Ratio
): Domain {
  const span = Math.max(window.d1 - window.d0, 1e-6);
  const zSpan = Math.max(extent.hi - extent.lo, 0.5) * 1.16;
  const mid = (extent.lo + extent.hi) / 2;
  if (ratio === "fit") return { x0: window.d0, x1: window.d1, y0: mid - zSpan / 2, y1: mid + zSpan / 2 };
  const width = Math.max(plot.width, 1);
  const height = Math.max(plot.height, 1);
  let mx = span / width;
  let my = mx / ratio;
  if (zSpan > my * height) {
    my = zSpan / height;
    mx = my * ratio;
  }
  const x0 = window.d0 + (span - mx * width) / 2;
  return { x0, x1: x0 + mx * width, y0: mid - (my * height) / 2, y1: mid + (my * height) / 2 };
}

/** Axis ticks every 1, 2 or 5 × 10ⁿ, about `target` of them, and the step they take. */
export function niceTicks(lo: number, hi: number, target: number): { step: number; values: number[] } {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return { step: 0, values: [] };
  const raw = span / Math.max(target, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const frac = raw / pow;
  const step = (frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10) * pow;
  const values: number[] = [];
  for (let v = Math.ceil(lo / step) * step, guard = 0; v <= hi + step * 1e-9 && guard < 200; v += step, guard++) {
    values.push(Number((Math.round(v / step) * step).toFixed(9)));
  }
  return { step, values };
}

/** SVG path of a series; a station with no height lifts the pen, so a hole in the surface stays a hole. */
export function tracePath(distances: number[], z: (number | null)[], xOf: (d: number) => number, yOf: (z: number) => number): string {
  let d = "";
  let down = false;
  for (let i = 0; i < distances.length; i++) {
    const v = z[i];
    if (v === null || v === undefined) {
      down = false;
      continue;
    }
    d += `${down ? "L" : "M"}${xOf(distances[i]).toFixed(1)} ${yOf(v).toFixed(1)}`;
    down = true;
  }
  return d;
}

/** The station nearest a chainage; distances ascend. */
export function nearestIndex(distances: number[], d: number): number {
  if (distances.length === 0) return -1;
  let lo = 0;
  let hi = distances.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] <= d) lo = mid;
    else hi = mid;
  }
  return Math.abs(distances[lo] - d) <= Math.abs(distances[hi] - d) ? lo : hi;
}

// ---------------------------------------------------------------- readouts

export type PinMode = "elevation" | "horizontal" | "grade";

export interface Grade {
  percent: number;
  degrees: number;
  /** n of a 1:n slope; null on the flat. */
  run: number | null;
}

export function gradeOf(rise: number, run: number): Grade | null {
  if (!(run > 0) || !Number.isFinite(rise)) return null;
  return {
    percent: (rise / run) * 100,
    degrees: (Math.atan2(rise, run) * 180) / Math.PI,
    run: rise === 0 ? null : run / Math.abs(rise),
  };
}

/** The slope of a series at station i, taken between the stations about halfWindowM either side of it. */
export function tangentGrade(distances: number[], z: (number | null)[], i: number, halfWindowM: number): Grade | null {
  if (i < 0 || i >= distances.length || z[i] === null) return null;
  let a = i;
  while (a > 0 && z[a - 1] !== null && distances[i] - distances[a] < halfWindowM) a--;
  let b = i;
  while (b < distances.length - 1 && z[b + 1] !== null && distances[b] - distances[i] < halfWindowM) b++;
  if (a === b) return null;
  return gradeOf((z[b] as number) - (z[a] as number), distances[b] - distances[a]);
}

/** Where a series crosses a level nearest chainage `at` on each side: its width at that level around `at`. None across a hole in the surface. */
export function widthAtLevel(distances: number[], z: (number | null)[], at: number, level: number): { from: number; to: number } | null {
  let from = -Infinity;
  let to = Infinity;
  for (let i = 1; i < distances.length; i++) {
    const za = z[i - 1];
    const zb = z[i];
    if (za === null || zb === null || za === undefined || zb === undefined) continue;
    const a = za - level;
    const b = zb - level;
    if (a === 0 && b === 0) continue;
    if (a * b > 0) continue;
    const c = distances[i - 1] + (a / (a - b)) * (distances[i] - distances[i - 1]);
    if (c <= at && c > from) from = c;
    if (c >= at && c < to) to = c;
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] > from && distances[i] < to && (z[i] === null || z[i] === undefined)) return null;
  }
  return { from, to };
}

// ---------------------------------------------------------------- exports

export interface ExportSeries {
  label: string;
  z: (number | null)[] | null;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One row per station: chainage, position and each surface's height, in metres. */
export function profileCsv(data: Pick<ProfileResponse, "distance_m" | "lon" | "lat">, series: ExportSeries[]): string {
  const head = ["chainage_m", "longitude", "latitude", ...series.map((s) => `${s.label} (m)`)].map(csvCell).join(",");
  const rows = data.distance_m.map((d, i) =>
    [d.toFixed(3), data.lon[i].toFixed(8), data.lat[i].toFixed(8), ...series.map((s) => (s.z?.[i] == null ? "" : (s.z[i] as number).toFixed(3)))].join(",")
  );
  return [head, ...rows].join("\n") + "\n";
}

/** A DXF layer name: letters, digits, - and _, at most 31 characters. */
export function dxfLayer(label: string): string {
  const name = label.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 31);
  return name || "SURFACE";
}

/**
 * An AutoCAD R12 DXF of the series, one polyline per unbroken run on a layer
 * named after its surface. Without `plan` it is the section in 2D, chainage
 * along X and height up Y; with `plan` (each station's easting and northing)
 * it is the line in 3D, height up Z.
 */
export function profileDxf(distances: number[], series: ExportSeries[], plan?: { east: number[]; north: number[] }): string {
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const n = (v: number) => v.toFixed(4);
  for (const s of series) {
    if (!s.z) continue;
    const layer = dxfLayer(s.label);
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 2) {
        out.push("0", "POLYLINE", "8", layer, "66", "1", "70", plan ? "8" : "0", "10", "0", "20", "0", "30", "0");
        for (const i of run) {
          const z = s.z![i] as number;
          out.push("0", "VERTEX", "8", layer);
          if (plan) out.push("10", n(plan.east[i]), "20", n(plan.north[i]), "30", n(z), "70", "32");
          else out.push("10", n(distances[i]), "20", n(z), "30", "0");
        }
        out.push("0", "SEQEND", "8", layer);
      }
      run = [];
    };
    for (let i = 0; i < distances.length; i++) {
      if (s.z[i] === null || s.z[i] === undefined) flush();
      else run.push(i);
    }
    flush();
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}
