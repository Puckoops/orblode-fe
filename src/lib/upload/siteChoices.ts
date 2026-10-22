import type { PhotoHeights, PhotogrammetryPreset } from "../api/orblodeSvc.ts";
import type { Layer } from "./pipelineGraph.ts";

// What someone chose for a site's last upload, kept in this browser when they ask, so the next upload of the site
// starts from it. A convenience only: nothing reads it but the Create stepper.

export interface SiteChoices {
  source: "photos" | "files";
  layers: Record<Layer, boolean>;
  gcpFile: boolean;
  rtk: boolean;
  heights: PhotoHeights;
  preset: PhotogrammetryPreset;
  fallbackCrs: string;
  fallbackDatum: string;
  siteVectors: boolean;
  siteDesign: boolean;
}

export const DEFAULT_CHOICES: SiteChoices = {
  source: "photos",
  layers: { ortho: true, dsm: true, dtm: true, pointcloud: true },
  gcpFile: false,
  rtk: false,
  heights: "ellipsoidal",
  preset: "standard",
  fallbackCrs: "",
  fallbackDatum: "",
  siteVectors: true,
  siteDesign: true,
};

const key = (projectId: string) => `orblode-upload-choices:${projectId}`;

const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T => (values.includes(v as T) ? (v as T) : fallback);

/** The stored choices over the defaults; anything unreadable keeps its default. */
export function parseChoices(raw: string | null): SiteChoices {
  let d: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") d = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_CHOICES;
  }
  const layers = (d.layers && typeof d.layers === "object" ? d.layers : {}) as Record<string, unknown>;
  return {
    source: oneOf(d.source, ["photos", "files"] as const, DEFAULT_CHOICES.source),
    layers: {
      ortho: bool(layers.ortho, true),
      dsm: bool(layers.dsm, true),
      dtm: true,
      pointcloud: bool(layers.pointcloud, true),
    },
    gcpFile: bool(d.gcpFile, DEFAULT_CHOICES.gcpFile),
    rtk: bool(d.rtk, DEFAULT_CHOICES.rtk),
    heights: oneOf(d.heights, ["ellipsoidal", "msl"] as const, DEFAULT_CHOICES.heights),
    preset: oneOf(d.preset, ["fast", "standard", "high"] as const, DEFAULT_CHOICES.preset),
    fallbackCrs: typeof d.fallbackCrs === "string" ? d.fallbackCrs : "",
    fallbackDatum: typeof d.fallbackDatum === "string" ? d.fallbackDatum : "",
    siteVectors: bool(d.siteVectors, DEFAULT_CHOICES.siteVectors),
    siteDesign: bool(d.siteDesign, DEFAULT_CHOICES.siteDesign),
  };
}

/** The site's remembered choices, or the defaults; never throws, as storage may be blocked. */
export function loadChoices(projectId: string): SiteChoices {
  try {
    return parseChoices(localStorage.getItem(key(projectId)));
  } catch {
    return DEFAULT_CHOICES;
  }
}

export function saveChoices(projectId: string, choices: SiteChoices) {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(choices));
  } catch {
    // Storage full or blocked: the next upload starts from the defaults.
  }
}
