// Cross-section profile (FR-09) — pure logic, no React, no Cesium, no network.
// Mirrors lib/viewer/contours.ts: this module shapes the profile-extract
// REQUEST, validates the elevation series that comes back, and turns it into
// chart geometry. It never renders and never fetches.
//
// Dispatch is the ADVANCED explicit-payload path. asset-svc-refactor's
// measurements/service.go maps kind `cross_section` → processor
// `profile-extract` v1, but its buildInputs only auto-resolves volume-compute
// payloads — every other kind returns ErrComputeUnsupported (422). So the FE
// builds the payload itself, exactly as the deployed processor's Input schema
// declares it (workflow-geo-svc profileextract/types.go):
//
//   payload: { source: { url, kind: "terrain", crs }, polyline: [[x,y], …],
//              spacing_m }
//   inputs:  [{ url, kind: "terrain", crs }]
//
// CRS CONTRACT (the sharp edge): profile.py samples the DSM by transforming
// polyline coordinates through the raster's own geotransform, so `polyline`
// MUST be in the DSM's CRS — lon/lat degrees for a geographic DSM, easting/
// northing for a projected one. Measurement geometry is stored as WGS84
// GeoJSON, so a projected DSM needs the vertices forwarded through the working
// transform first. `projectPolyline` below is that seam; the caller supplies
// the transform (lib/viewer/projection.ts) and `needsProjection` decides
// whether it is required at all. Sending degrees to a UTM DSM would sample the
// raster's far corner and silently return garbage elevations, so the decision
// is explicit rather than inferred at the call site.

import type { GenerateArtifactRef } from "@/lib/api/orblodeSvc";

/** Default chainage interval — matches the PRD's 1 m sampling and the
 * processor's own default (profileextract Input.spacing). */
export const DEFAULT_SPACING_M = 1;

/** Chainage spacing is clamped into a band that keeps the series useful and the
 * payload sane: below 0.1 m the sampling outruns any real DSM's ground
 * resolution, above 50 m the chart stops resembling terrain. */
export const MIN_SPACING_M = 0.1;
export const MAX_SPACING_M = 50;

export function clampSpacing(spacingM: number): number {
  if (!Number.isFinite(spacingM) || spacingM <= 0) return DEFAULT_SPACING_M;
  return Math.min(Math.max(spacingM, MIN_SPACING_M), MAX_SPACING_M);
}

/** A geographic CRS takes the polyline in lon/lat degrees — exactly what the
 * measurement already stores — so no projection is needed. Anything else
 * (UTM/MGA/NZTM/…) needs the vertices forwarded into projected metres.
 *
 * Recognises the WGS84 family by code and the `+proj=longlat` def form. An
 * ABSENT crs is treated as geographic: manifests for the geographic DSMs this
 * runs against routinely omit it, and profile.py itself treats a missing SRS as
 * "sample where the geotransform says", which for those rasters is degrees. */
export function needsProjection(crs?: string | null): boolean {
  if (!crs) return false;
  const c = crs.trim().toLowerCase();
  if (!c) return false;
  if (c.includes("+proj=longlat")) return false;
  // EPSG:4326 (WGS84), 4979 (3D), 4258 (ETRS89) are all degree-based.
  return !/(?:^|:)(4326|4979|4258)$/.test(c);
}

/** Forward WGS84 [lon, lat] vertices into the DSM's CRS. `forward` is a
 * WorkingTransform.forward (proj4). Returns null when any vertex fails to
 * project to finite numbers — the caller must NOT dispatch a partially
 * projected polyline. */
export function projectPolyline(
  lonLat: [number, number][],
  forward: (p: [number, number]) => [number, number]
): [number, number][] | null {
  const out: [number, number][] = [];
  for (const p of lonLat) {
    const [x, y] = forward(p);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([x, y]);
  }
  return out;
}

export interface ProfileRequest {
  payload: Record<string, unknown>;
  inputs: GenerateArtifactRef[];
}

/**
 * Builds the explicit POST /measurements/:id/compute body for a cross-section.
 *
 * `polyline` must ALREADY be in the DSM's CRS (see the CRS contract above).
 * `crs` is the terrain layer's manifest crs and is echoed onto the artifact ref
 * only when present, keeping the wire shape clean for CRS-less manifests —
 * the same convention buildContourRequest follows.
 */
export function buildProfileRequest(opts: {
  sourceUrl: string;
  crs?: string;
  polyline: [number, number][];
  spacingM?: number;
}): ProfileRequest {
  const source: GenerateArtifactRef = { url: opts.sourceUrl, kind: "terrain" };
  if (opts.crs) source.crs = opts.crs;
  return {
    payload: {
      source,
      polyline: opts.polyline,
      spacing_m: clampSpacing(opts.spacingM ?? DEFAULT_SPACING_M),
    },
    inputs: [source],
  };
}

/** One station on the profile. `z` is null where the DSM had nodata — the gap
 * is preserved rather than interpolated, so the chart can break the line
 * instead of drawing a straight lie across a hole in the surface. */
export interface ProfileSample {
  distanceM: number;
  x: number;
  y: number;
  z: number | null;
}

export interface ProfileSeries {
  samples: ProfileSample[];
  lengthM: number;
  /** Elevation extent over the non-null samples; null when every station is
   * nodata (the chart then shows an empty state, not a zero-height axis). */
  minZ: number | null;
  maxZ: number | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Validates the profile-extract artifact JSON into a series.
 *
 * Wire shape (profileextract/profile.py):
 *   { samples: [{distance_m, x, y, z|null}, …], length_m }
 *
 * Defensive by construction — this parses a fetched remote document, so every
 * field is checked and a malformed one yields null rather than a half-built
 * series that renders as NaN geometry. Samples are sorted by chainage (the
 * script emits them in order; sorting makes the nearest-station lookup's
 * monotonicity assumption true regardless).
 */
export function parseProfileSeries(raw: unknown): ProfileSeries | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.samples)) return null;

  const samples: ProfileSample[] = [];
  for (const entry of doc.samples) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const distanceM = num(e.distance_m);
    if (distanceM === null) continue; // a station with no chainage has no x-position
    samples.push({
      distanceM,
      x: num(e.x) ?? 0,
      y: num(e.y) ?? 0,
      z: num(e.z), // null preserved — nodata gap
    });
  }
  if (samples.length < 2) return null; // a profile needs a run, not a point

  samples.sort((a, b) => a.distanceM - b.distanceM);

  let minZ: number | null = null;
  let maxZ: number | null = null;
  for (const s of samples) {
    if (s.z === null) continue;
    minZ = minZ === null || s.z < minZ ? s.z : minZ;
    maxZ = maxZ === null || s.z > maxZ ? s.z : maxZ;
  }

  const lengthM = num(doc.length_m) ?? samples[samples.length - 1].distanceM;
  return { samples, lengthM, minZ, maxZ };
}

export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

/** A y-axis domain padded off the data extent so the trace never touches the
 * frame. A perfectly flat profile (minZ === maxZ) would give a zero-height
 * domain and divide by zero in the scale, so it is opened to ±0.5 m and the
 * line renders through the middle. */
export function elevationDomain(
  minZ: number,
  maxZ: number
): { lo: number; hi: number } {
  if (maxZ - minZ < 1e-6) return { lo: minZ - 0.5, hi: maxZ + 0.5 };
  const pad = (maxZ - minZ) * 0.08;
  return { lo: minZ - pad, hi: maxZ + pad };
}

export interface ProfileScales {
  /** chainage metres → svg x */
  xOf(distanceM: number): number;
  /** elevation metres → svg y */
  yOf(z: number): number;
  /** svg x → chainage metres (hover hit-testing) */
  distanceAt(svgX: number): number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  domain: { lo: number; hi: number };
}

/** Builds the linear scales mapping the series into the plot rect. Chainage
 * runs left→right, elevation bottom→top (SVG y is inverted). */
export function buildScales(series: ProfileSeries, box: ChartBox): ProfileScales {
  const plotLeft = box.padLeft;
  const plotRight = box.width - box.padRight;
  const plotTop = box.padTop;
  const plotBottom = box.height - box.padBottom;
  const plotW = Math.max(plotRight - plotLeft, 1);
  const plotH = Math.max(plotBottom - plotTop, 1);

  const span = series.lengthM > 0 ? series.lengthM : 1;
  const domain = elevationDomain(series.minZ ?? 0, series.maxZ ?? 0);
  const zSpan = Math.max(domain.hi - domain.lo, 1e-6);

  return {
    xOf: (d) => plotLeft + (d / span) * plotW,
    yOf: (z) => plotBottom - ((z - domain.lo) / zSpan) * plotH,
    distanceAt: (svgX) => ((svgX - plotLeft) / plotW) * span,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    domain,
  };
}

/**
 * The trace as SVG path data. Nodata gaps BREAK the path (a fresh `M` after
 * each hole) rather than bridging them, so a void in the DSM reads as a void
 * instead of a straight interpolated segment across it.
 */
export function buildTracePath(series: ProfileSeries, scales: ProfileScales): string {
  let d = "";
  let penDown = false;
  for (const s of series.samples) {
    if (s.z === null) {
      penDown = false;
      continue;
    }
    const x = scales.xOf(s.distanceM);
    const y = scales.yOf(s.z);
    d += `${penDown ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    penDown = true;
  }
  return d;
}

/**
 * The filled area under the trace, as one closed subpath per contiguous run of
 * valid samples. Runs are closed down to the plot floor, so a gap leaves a real
 * hole in the fill rather than a phantom column.
 */
export function buildAreaPath(series: ProfileSeries, scales: ProfileScales): string {
  let d = "";
  let run: { x: number; y: number }[] = [];

  const flush = () => {
    if (run.length >= 2) {
      const first = run[0];
      const last = run[run.length - 1];
      d += `M${first.x.toFixed(2)} ${scales.plotBottom.toFixed(2)}`;
      for (const p of run) d += `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
      d += `L${last.x.toFixed(2)} ${scales.plotBottom.toFixed(2)}Z`;
    }
    run = [];
  };

  for (const s of series.samples) {
    if (s.z === null) {
      flush();
      continue;
    }
    run.push({ x: scales.xOf(s.distanceM), y: scales.yOf(s.z) });
  }
  flush();
  return d;
}

/**
 * Nearest station to a chainage — the hover hit-test, and the bridge the 3D
 * canvas uses to answer "which chart point is the cursor over?".
 *
 * Binary search over the chainage-sorted samples, so a 10 000-station profile
 * costs ~14 comparisons per pointer move instead of a linear scan at 60 Hz.
 * Returns the sample AND its index (the caller keys hover state on the index).
 */
export function nearestSample(
  series: ProfileSeries,
  distanceM: number
): { sample: ProfileSample; index: number } | null {
  const { samples } = series;
  if (samples.length === 0) return null;

  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].distanceM <= distanceM) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(samples[lo].distanceM - distanceM);
  const dHi = Math.abs(samples[hi].distanceM - distanceM);
  const index = dLo <= dHi ? lo : hi;
  return { sample: samples[index], index };
}

/**
 * The station nearest a world position — the REVERSE direction of the hover
 * bridge (3D cursor → chart marker, FR-09's bidirectional sync).
 *
 * Compares in the sample's own coordinate space, so `x`/`y` must be in the same
 * CRS the polyline was dispatched in. Squared distance (no sqrt) since only the
 * ordering matters. `maxDistance` rejects a cursor that isn't near the line at
 * all — without it, hovering anywhere on the map would light up whichever
 * station happened to be least far away.
 */
export function nearestSampleToPoint(
  series: ProfileSeries,
  x: number,
  y: number,
  maxDistance: number
): { sample: ProfileSample; index: number } | null {
  let best: { sample: ProfileSample; index: number } | null = null;
  let bestD2 = maxDistance * maxDistance;
  for (let i = 0; i < series.samples.length; i++) {
    const s = series.samples[i];
    if (s.z === null) continue;
    const dx = s.x - x;
    const dy = s.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = { sample: s, index: i };
    }
  }
  return best;
}

/**
 * Axis ticks at "nice" 1/2/5×10ⁿ intervals, targeting ~`target` divisions.
 * Shared by both axes: chainage ticks over [0, lengthM] and elevation ticks
 * over the padded domain. Returns the tick VALUES; the caller positions them
 * through the scales.
 */
export function axisTicks(lo: number, hi: number, target = 5): number[] {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return [];
  const raw = span / Math.max(target, 1);
  const exp = Math.floor(Math.log10(raw));
  const pow = 10 ** exp;
  const frac = raw / pow;
  const niceFrac = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  const step = niceFrac * pow;

  const ticks: number[] = [];
  const first = Math.ceil(lo / step) * step;
  // Guard the loop against a degenerate step rather than trusting the maths.
  for (let v = first, guard = 0; v <= hi + step * 1e-9 && guard < 100; v += step, guard++) {
    // Re-round: repeated addition of a fractional step accumulates float drift
    // (0.1+0.1+0.1 → 0.30000000000000004), which would surface in tick labels.
    ticks.push(Number((Math.round(v / step) * step).toFixed(6)));
  }
  return ticks;
}

/** Grade between the first and last valid station, as a percentage. Null when
 * fewer than two stations carry elevation, or the run has no length. */
export function overallGradePercent(series: ProfileSeries): number | null {
  const valid = series.samples.filter((s) => s.z !== null);
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  const run = last.distanceM - first.distanceM;
  if (run <= 0) return null;
  return (((last.z as number) - (first.z as number)) / run) * 100;
}

/** The minimum of a manifest TerrainLayer this module needs. Structural so the
 * pure module never imports the API surface at runtime. */
export interface ProfileSourceLayer {
  surface_type?: string;
  raw_raster_url?: string;
  crs?: string;
}

/**
 * The surface to sample, by the same DSM → DTM → any precedence
 * `handleGenerateContours` and `handleCompareToDesign` use. A cross-section is
 * read as "what the drone saw", so the DSM wins; the DTM is the fallback when
 * no surface model was produced. Returns null when nothing is co-registered
 * (no `raw_raster_url`), which is what disables the compute.
 */
export function pickProfileSource<T extends ProfileSourceLayer>(
  terrain: readonly T[] | null | undefined
): T | null {
  const layers = terrain ?? [];
  return (
    layers.find((t) => t.surface_type === "dsm" && t.raw_raster_url) ??
    layers.find((t) => t.surface_type === "dtm" && t.raw_raster_url) ??
    layers.find((t) => t.raw_raster_url) ??
    null
  );
}

/**
 * The [lon, lat] vertices of a LineString geometry, or null if the geometry is
 * not a usable line. Measurement geometry arrives as an untyped GeoJSON bag, so
 * every coordinate is checked — a malformed pair would reach profile.py as a
 * NaN and sample the raster's clamped edge instead of failing loudly.
 */
export function lineStringCoords(
  geometry: { type?: string; coordinates?: unknown } | null | undefined
): [number, number][] | null {
  if (!geometry || geometry.type !== "LineString") return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  const out: [number, number][] = [];
  for (const pair of geometry.coordinates) {
    if (!Array.isArray(pair) || pair.length < 2) return null;
    const [lon, lat] = pair;
    if (typeof lon !== "number" || !Number.isFinite(lon)) return null;
    if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
    out.push([lon, lat]);
  }
  return out.length >= 2 ? out : null;
}

/** The profile artifact URL on a result doc, when the compute produced one. */
export function profileUrlOf(
  result: { artifacts?: { profile_url?: string } } | null | undefined
): string | null {
  const url = result?.artifacts?.profile_url;
  return typeof url === "string" && url.trim() ? url : null;
}
