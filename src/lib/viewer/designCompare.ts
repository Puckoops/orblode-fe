// Design-vs-as-built (grade conformance) — pure logic, no React, no Cesium, no
// network. Twin of lib/viewer/contours.ts for the "design-compare" processor:
// it shapes the exact whole-survey `generate` request the backend expects,
// classifies the site-wide conformance result that lands asynchronously in the
// manifest, and derives the XYZ tile template its heatmap renders from. Field
// names are validated server-side (asset-svc dtos / workflow-geo-svc framework
// schema) — they matter.
//
// The dispatch is async: asset-svc persists the result and it reappears in the
// render manifest's cut/fill analytics array as a CutFillEntry with role
// "design_conformance". The heatmap is rendered by the SAME imagery machinery
// as contour tiles (an ImageryLayer over an XYZ pyramid) — this module only
// shapes the REQUEST, recognizes the RESULT, and extracts the tile TEMPLATE; it
// never renders.

import type { CutFillEntry, GenerateRequest, Manifest } from "@/lib/api/orblodeSvc";

/** Resolved inputs for a whole-survey design comparison. `surveySurfaceUrl` is
 * the DSM `raw_raster_url`; `designUrl` the design's `file_url`. BOTH must be
 * the real bucket URLs the backend can read (the caller un-proxies the store
 * manifest's `/files` proxy paths first, exactly like the contour dispatch). */
export interface DesignCompareInputs {
  surveySurfaceUrl: string;
  surveyCrs?: string;
  designUrl: string;
  designCrs?: string;
  designFormat: string;
  surveyId: string;
  projectId: string;
}

/**
 * Builds the POST /surveys/:id/generate body that dispatches a whole-survey
 * design comparison, lock-step with the deployed `design-compare` v1 processor:
 *
 *   processor_type: "design-compare", version: "v1",
 *   payload: {
 *     survey_surface: { url, crs? },
 *     design_surface: { url, crs?, format },
 *     survey_id, project_id, survey_version: "v1"
 *   }
 *
 * `crs` is only emitted when present (a co-registered surface always carries
 * one; the key is omitted otherwise so the wire shape stays clean), mirroring
 * buildContourRequest.
 */
export function buildDesignCompareRequest(opts: DesignCompareInputs): GenerateRequest {
  const survey_surface: Record<string, unknown> = { url: opts.surveySurfaceUrl };
  if (opts.surveyCrs) survey_surface.crs = opts.surveyCrs;

  const design_surface: Record<string, unknown> = {
    url: opts.designUrl,
    format: opts.designFormat,
  };
  if (opts.designCrs) design_surface.crs = opts.designCrs;

  return {
    processor_type: "design-compare",
    version: "v1",
    payload: {
      survey_surface,
      design_surface,
      survey_id: opts.surveyId,
      project_id: opts.projectId,
      survey_version: "v1",
    },
  };
}

/** Formats the design-compare processor can consume at first. A design whose
 * format is anything else is listed but not comparable (the picker guards it
 * with a "LandXML designs only for now" hint). */
export const DESIGN_COMPARE_FORMATS = ["landxml", "geotiff"] as const;

/** True when a design's format is one the `design-compare` processor supports.
 * Case-insensitive; accepts the common GeoTIFF spellings. */
export function designCompareEligible(format?: string): boolean {
  const f = (format || "").trim().toLowerCase();
  return f === "landxml" || f === "geotiff" || f === "tif" || f === "tiff";
}

/**
 * True when a cut/fill analytics entry is the site-wide DESIGN conformance
 * result (survey-vs-design), not an ordinary survey-vs-survey cut/fill.
 *
 * The definitive marker is `role === "design_conformance"` (the field the
 * backend added for exactly this). When `role` is present it MUST match — a
 * different role is some other analysis and is rejected. Only when `role` is
 * absent (a backend that predates the field) do we fall back to the structural
 * signature these entries also carry: site scope with no comparison survey.
 */
export function isDesignConformanceEntry(
  e: Pick<CutFillEntry, "role" | "scope" | "comparison_survey_id">
): boolean {
  if (e.role) return e.role === "design_conformance";
  return e.scope === "site" && e.comparison_survey_id === "";
}

/** The manifest's design-conformance cut/fill entries, in manifest order. The
 * single source of the `conformance-{i}` index used by both the layer builder
 * (heatmap handles/controls) and the panel (numbers), so the two stay aligned. */
export function designConformanceEntries(manifest: Manifest | null): CutFillEntry[] {
  return (manifest?.analytics.cut_fill ?? []).filter(isDesignConformanceEntry);
}

/**
 * Turns a conformance entry's `heatmap_tiles_url` into an XYZ `{z}/{x}/{y}`
 * template the imagery provider consumes, or null when there is no usable URL
 * (numbers-only result, or a still-generating heatmap).
 *
 * A URL that already carries a `{z}` placeholder is used verbatim; a bare
 * directory URL gets the gdal2tiles `/{z}/{x}/{y}.png` suffix — the exact
 * convention `pickXyzTemplate` and the lens/ortho builders use. The string is
 * returned as-is otherwise, so it keeps whatever CORS proxying was applied at
 * manifest load (filesUrlsIn).
 */
export function heatmapTileTemplate(tilesUrl?: string | null): string | null {
  if (typeof tilesUrl !== "string") return null;
  const url = tilesUrl.trim();
  if (!url) return null;
  if (url.includes("{z}")) return url;
  return url.replace(/\/+$/, "") + "/{z}/{x}/{y}.png";
}
