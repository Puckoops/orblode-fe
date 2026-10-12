import type { AssetLayer, ManifestSurvey, MeasurementResultDoc, TerrainLayer } from "../api/orblodeSvc.ts";
import { getWorkingTransform } from "../viewer/projection.ts";
import type { CutFillFigures, Featured, OrthoSource, SiteInfo } from "./site.ts";

/** One entry of orblode-svc's public `GET /showcase`: a flagged survey's manifest and its label. */
export type ShowcaseEntry = {
  survey: ManifestSurvey;
  label?: string;
  layers: { terrain: TerrainLayer[] | null; ortho: AssetLayer[] | null };
  measurements: ShowcaseMeasurement[] | null;
};

export type ShowcaseMeasurement = {
  id: string;
  kind: string;
  name: string;
  status: string;
  geometry?: { type: string; coordinates: unknown };
  params?: { from?: { type?: string } };
  result?: MeasurementResultDoc;
  computed_at?: number;
};

const STORAGE_HTTP = "https://storage.googleapis.com/";
const STORAGE_GS = "gs://";

/** The public, same-origin path for a stored object URL, or null for anything else. */
export function showcasePath(url: string | undefined): string | null {
  if (!url) return null;
  const rest = url.startsWith(STORAGE_HTTP) ? url.slice(STORAGE_HTTP.length) : url.startsWith(STORAGE_GS) ? url.slice(STORAGE_GS.length) : null;
  const slash = rest?.indexOf("/") ?? -1;
  if (!rest || slash <= 0 || slash === rest.length - 1) return null;
  return `/showcase/files/${rest.slice(slash + 1)}`;
}

const dsmOf = (entry: ShowcaseEntry) => {
  const terrain = entry.layers.terrain ?? [];
  const layer = terrain.find((t) => t.surface_type?.toLowerCase() === "dsm") ?? terrain[0];
  const url = layer ? layer.compute_raster_url || layer.raw_raster_url : undefined;
  return layer && url ? { layer, url } : null;
};

function orthoOf(entry: ShowcaseEntry): OrthoSource | null {
  for (const layer of entry.layers.ortho ?? []) {
    const urls = layer.output_urls ?? {};
    const template = urls.template ?? Object.values(urls).find((v) => typeof v === "string" && v.includes("{z}"));
    const path = showcasePath(template);
    if (path) return { template: path, minZoom: layer.min_zoom ?? 12, maxZoom: layer.max_zoom ?? 21 };
  }
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-02-14" or epoch milliseconds as "14 Feb 2025". */
export function displayDate(value: string | number | undefined): string | null {
  if (value === undefined || value === "") return null;
  const d = typeof value === "number" ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const BASES: Record<string, string> = {
  smart_base: "Smart base",
  reference_level: "Reference level",
  previous_survey: "Previous survey",
  survey_terrain: "Survey terrain",
  design: "Design surface",
};

const metric = (m: ShowcaseMeasurement, ...keys: string[]) => {
  for (const key of keys) {
    const v = m.result?.metrics?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

const ring = (m: ShowcaseMeasurement): [number, number][] | null => {
  if (m.geometry?.type !== "Polygon" || !Array.isArray(m.geometry.coordinates)) return null;
  const outer = (m.geometry.coordinates as number[][][])[0];
  if (!Array.isArray(outer)) return null;
  const [first, last] = [outer[0], outer[outer.length - 1]];
  const open = outer.length > 1 && first[0] === last[0] && first[1] === last[1] ? outer.slice(0, -1) : outer;
  return open.length >= 3 ? open.map((p) => [p[0], p[1]]) : null;
};

/**
 * The landing page's view of the showcase: the newest flagged survey with a DSM, the flagged
 * survey of the same site before it, and the biggest completed volume and cut/fill measurements.
 * Null when nothing usable is flagged or the survey's coordinate system can't be resolved.
 */
export async function siteFromShowcase(entries: ShowcaseEntry[]): Promise<SiteInfo | null> {
  const usable = entries.filter((e) => dsmOf(e)).sort((a, b) => a.survey.survey_date.localeCompare(b.survey.survey_date));
  const primary = usable[usable.length - 1];
  if (!primary) return null;
  const sameSite = usable.filter((e) => e.survey.project_id === primary.survey.project_id);
  const earlier = sameSite.length > 1 ? sameSite[sameSite.length - 2] : null;
  const dsm = dsmOf(primary)!;
  const bbox = dsm.layer.bbox ?? primary.layers.ortho?.find((o) => o.bbox)?.bbox;
  const crs = primary.survey.working_crs || dsm.layer.crs;
  if (!bbox || bbox.length < 4 || !crs) return null;
  const transform = await getWorkingTransform(crs);
  if (!transform) return null;

  const lon = (bbox[0] + bbox[2]) / 2, lat = (bbox[1] + bbox[3]) / 2;
  const [east, north] = transform.forward([lon, lat]);
  const local = ([x, y]: [number, number]): [number, number] => {
    const [e, n] = transform.forward([x, y]);
    return [e - east, n - north];
  };

  const measurements = (primary.measurements ?? []).filter((m) => m.status === "completed");
  let featured: Featured | null = null;
  for (const m of measurements) {
    const volume = metric(m, "volume_m3", "adjusted_volume_m3"), points = ring(m);
    if (!["stockpile", "volume"].includes(m.kind) || !volume || volume <= 0 || !points) continue;
    if (featured && (featured.volume ?? 0) >= volume) continue;
    const outline = points.map(local);
    const centre: [number, number] = [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length];
    featured = {
      name: m.name,
      outline,
      centre,
      reach: Math.max(...outline.map((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1]))),
      volume,
      area: metric(m, "area_m2"),
      base: BASES[m.params?.from?.type ?? ""] ?? null,
      computedAt: displayDate(m.computed_at),
    };
  }

  let cutFill: CutFillFigures | null = null;
  for (const m of measurements) {
    const cut = metric(m, "cut_volume_m3"), fill = metric(m, "fill_volume_m3");
    if (m.kind !== "cut_fill" || cut === null || fill === null) continue;
    if (cutFill && cutFill.cut + cutFill.fill >= cut + fill) continue;
    cutFill = { cut, fill, label: m.name };
  }

  const earlierDsm = earlier ? dsmOf(earlier) : null;
  return {
    mode: "survey",
    name: primary.label?.trim() || "Showcase site",
    crs,
    origin: { east, north },
    lat,
    lon,
    surveyDate: displayDate(primary.survey.survey_date) ?? primary.survey.survey_date,
    earlierDate: earlier ? displayDate(earlier.survey.survey_date) : null,
    surveyCount: sameSite.length,
    featured,
    cutFill,
    source: {
      dsm: showcasePath(dsm.url)!,
      ortho: orthoOf(primary),
      earlierDsm: earlierDsm ? showcasePath(earlierDsm.url) : null,
      earlierOrtho: earlier ? orthoOf(earlier) : null,
      projDef: transform.def,
    },
  };
}
