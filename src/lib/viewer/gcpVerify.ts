// GCP verification (FR-17) — pure logic, no React, no Cesium, no network.
// Sibling of lib/viewer/contours.ts and lib/viewer/designCompare.ts: this module
// shapes the `gcp-verify` REQUEST, finds the result in the render manifest, and
// reads the verdict out of it. It never renders and never fetches.
//
// The processor emits its report as a GeoJSON FeatureCollection tagged
// `role: "gcp_verification"`, so it lands in the manifest as an ordinary
// VectorLayer. The headline numbers ride in that layer's `properties` (copied
// from the artifact metadata), which means the panel can show the verdict
// without downloading the per-point document at all — that fetch only happens
// when the user opens the failing-marks list.

import type { GenerateArtifactRef, GenerateRequest, Manifest, VectorLayer } from "@/lib/api/orblodeSvc";

/** The PRD's ±0.01 m alignment threshold (FR-17), mirroring the processor's own
 * default in gcpverify/residuals.go. */
export const DEFAULT_TOLERANCE_M = 0.01;

/** The manifest role the processor writes its report under. */
export const GCP_VERIFICATION_ROLE = "gcp_verification";
/** The role gcp-ingest writes the raw marks under — the verify input. */
export const GCP_SOURCE_ROLE = "gcps";

/**
 * Builds the POST /surveys/:id/generate body that dispatches a GCP check,
 * lock-step with the deployed `gcp-verify` v1 processor:
 *
 *   processor_type: "gcp-verify", version: "v1",
 *   payload: { source: {url, kind:"terrain", crs}, gcps: {url, kind:"vector"},
 *              tolerance_m },
 *   inputs:  [source, gcps]
 *
 * `sourceUrl` is the DSM/DTM's `raw_raster_url`; `gcpsUrl` is the ingested
 * marks' `geojson_url`. Both must be the REAL bucket urls — the caller
 * un-proxies them, exactly as the contour and design-compare dispatches do.
 */
export function buildGcpVerifyRequest(opts: {
  sourceUrl: string;
  crs?: string;
  gcpsUrl: string;
  toleranceM?: number;
}): GenerateRequest {
  const source: GenerateArtifactRef = { url: opts.sourceUrl, kind: "terrain" };
  if (opts.crs) source.crs = opts.crs;
  const gcps: GenerateArtifactRef = { url: opts.gcpsUrl, kind: "vector" };
  return {
    processor_type: "gcp-verify",
    version: "v1",
    payload: {
      source,
      gcps,
      tolerance_m: clampTolerance(opts.toleranceM ?? DEFAULT_TOLERANCE_M),
    },
    inputs: [source, gcps],
  };
}

/** Keeps the tolerance a positive, sane number of metres. A zero or negative
 * threshold would fail every mark; anything past 10 m is not an alignment
 * check. Non-finite input falls back to the PRD default. */
export function clampTolerance(toleranceM: number): number {
  if (!Number.isFinite(toleranceM) || toleranceM <= 0) return DEFAULT_TOLERANCE_M;
  return Math.min(toleranceM, 10);
}

/** The verdict, read from the manifest layer's `properties` bag. */
export interface GcpVerdict {
  /** Which axis was checked. Today always "vertical" — recorded so a later
   * horizontal check can be told apart from an old vertical-only report. */
  axis: string;
  toleranceM: number;
  passed: boolean;
  /** Every mark supplied. */
  total: number;
  /** Marks that landed on real surface data; `total - checked` is the coverage
   * gap, which is a distinct problem from a failing residual. */
  checked: number;
  withinTolerance: number;
  rmseM: number;
  /** Signed mean — the systematic bias. A large mean with a small std dev is
   * the signature of a vertical-datum mismatch rather than noisy alignment. */
  meanResidualM: number;
  stdDevM: number;
  maxAbsResidualM: number;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The GCP verification layer in the manifest, or null when the survey has
 * never been checked. */
export function gcpVerificationLayer(manifest: Manifest | null): VectorLayer | null {
  return (
    (manifest?.layers.vectors ?? []).find((v) => v.role === GCP_VERIFICATION_ROLE) ?? null
  );
}

/** The ingested GCP marks layer — the verify input, and what gates the button. */
export function gcpSourceLayer(manifest: Manifest | null): VectorLayer | null {
  return (manifest?.layers.vectors ?? []).find((v) => v.role === GCP_SOURCE_ROLE) ?? null;
}

/**
 * Reads the verdict out of a verification layer's untyped `properties` bag,
 * or null when the bag is missing the fields that make a verdict meaningful.
 *
 * Defensive by construction: this parses backend-shaped data through an
 * `unknown` bag, and a half-read verdict rendering as "0 of 0 passed" would be
 * worse than showing nothing. `passed` in particular is only ever trusted as a
 * real boolean — a missing field must never read as a green result.
 */
export function readVerdict(layer: VectorLayer | null): GcpVerdict | null {
  const p = layer?.properties;
  if (!p || typeof p !== "object") return null;

  const total = num(p.total);
  const checked = num(p.checked);
  const toleranceM = num(p.tolerance_m);
  if (total === null || checked === null || toleranceM === null) return null;

  return {
    axis: typeof p.axis === "string" ? p.axis : "vertical",
    toleranceM,
    passed: p.passed === true,
    total,
    checked,
    withinTolerance: num(p.within_tolerance) ?? 0,
    rmseM: num(p.rmse_m) ?? 0,
    meanResidualM: num(p.mean_residual_m) ?? 0,
    stdDevM: num(p.std_dev_m) ?? 0,
    maxAbsResidualM: num(p.max_abs_residual_m) ?? 0,
  };
}

/** How the verdict should read at a glance. Kept here (not in the component) so
 * the classification is testable and used identically wherever it appears. */
export type VerdictLevel = "pass" | "fail" | "no-coverage";

export function verdictLevel(v: GcpVerdict): VerdictLevel {
  // Nothing sampled is neither a pass nor a residual failure — the surface
  // simply doesn't cover the marks, and saying "failed" would send a surveyor
  // hunting for an alignment problem that isn't there.
  if (v.checked === 0) return "no-coverage";
  return v.passed ? "pass" : "fail";
}

/**
 * A one-line reading of what the numbers mean, for the panel's caption.
 *
 * The distinction it draws is the useful one: a bias much larger than the
 * spread points at a vertical-datum or geoid-model mismatch (a fixable
 * configuration error), while a large spread points at genuine model noise or
 * bad marks. Reporting only RMSE would leave the operator unable to tell those
 * apart.
 */
export function verdictSummary(v: GcpVerdict): string {
  if (v.checked === 0) {
    return "The surface has no coverage at any control point — nothing could be checked.";
  }
  const failing = v.checked - v.withinTolerance;
  if (v.passed) {
    return `All ${v.checked} checked marks are within ±${v.toleranceM} m.`;
  }
  const bias = Math.abs(v.meanResidualM);
  if (bias > v.toleranceM && bias > v.stdDevM * 2) {
    return `${failing} of ${v.checked} marks are out. The residuals share a ${v.meanResidualM > 0 ? "+" : "−"}${bias.toFixed(3)} m offset, which usually means a vertical-datum mismatch rather than a bad model.`;
  }
  return `${failing} of ${v.checked} marks are out, scattered rather than offset — check the marks themselves and the model's local accuracy.`;
}

/** One mark in the report's FeatureCollection. */
export interface GcpMark {
  id: string;
  lon: number;
  lat: number;
  zGcp: number;
  zSurface: number | null;
  residualM: number | null;
  checked: boolean;
  withinTolerance: boolean;
}

/**
 * Parses the report GeoJSON into marks. Returns the failing ones worst-first
 * plus the coverage gaps, which is what the expanded panel lists — a surveyor
 * needs to know WHICH marks to re-shoot, not that "some failed".
 */
export function parseMarks(raw: unknown): GcpMark[] | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.features)) return null;

  const out: GcpMark[] = [];
  for (const entry of doc.features) {
    if (!entry || typeof entry !== "object") continue;
    const f = entry as Record<string, unknown>;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const geom = (f.geometry ?? {}) as Record<string, unknown>;
    const coords = Array.isArray(geom.coordinates) ? (geom.coordinates as unknown[]) : [];

    const lon = num(coords[0]);
    const lat = num(coords[1]);
    if (lon === null || lat === null) continue;

    out.push({
      id: typeof props.id === "string" ? props.id : String(props.id ?? out.length + 1),
      lon,
      lat,
      zGcp: num(props.z_gcp) ?? 0,
      zSurface: num(props.z_surface),
      residualM: num(props.residual_m),
      checked: props.checked === true,
      withinTolerance: props.within_tolerance === true,
    });
  }
  return out.length > 0 ? out : null;
}

/** Failing marks, worst residual first. Coverage gaps are NOT failures. */
export function failingMarks(marks: GcpMark[]): GcpMark[] {
  return marks
    .filter((m) => m.checked && !m.withinTolerance && m.residualM !== null)
    .sort((a, b) => Math.abs(b.residualM as number) - Math.abs(a.residualM as number));
}

/** Marks the surface never covered — reported apart from failures. */
export function uncoveredMarks(marks: GcpMark[]): GcpMark[] {
  return marks.filter((m) => !m.checked);
}
