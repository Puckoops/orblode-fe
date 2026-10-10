// Calculation-type catalog + SurfaceRef param wiring (RE-PIVOT 2026-07-16).
// The floating toolbar draws GEOMETRY with a neutral kind; the right panel picks
// WHAT to compute (a CalcType → the measurement's persisted `kind`) and HOW (a
// base-surface method → `params.from`/`params.to` SurfaceRefs). This module is
// the single source of truth for both mappings, shared by the drawing-time
// Calculation panel, the FeatureInspector's editable config, and the save path.
//
// The SurfaceRef shapes mirror docs/contracts/surface-ref.md §3.1: from = the
// BASE surface, to = the current survey's surface (matching the backend's own
// stockpile default of from:smart_base / to:survey_terrain·dsm). Only the
// methods orblode-svc computes in PostGIS are offered: smart_base,
// reference_level, previous_survey and survey_terrain.

import type { MeasurementResultDoc } from "@/lib/api/orblodeSvc";
import { isEpochMs, type EpochMs } from "../time.ts";

export interface CalcType {
  id: string;
  label: string;
  hint: string;
  /** Persisted measurement kind (open enum, FE-driven — measurement.go:25). */
  kind: string;
  /** Volume-type calc: the base-surface method config applies + auto-compute. */
  needsBase?: boolean;
}

/** Geometry mode → offered calculations ("what to compute"). */
export const CALC_TYPES: Record<"probe" | "polyline" | "polygon", CalcType[]> = {
  probe: [
    {
      id: "point-elevation",
      label: "Point elevation",
      hint: "Sampled ground height at the picked point.",
      kind: "elevation",
    },
  ],
  polyline: [
    { id: "length", label: "Length", hint: "3D length along the line.", kind: "distance" },
    {
      id: "cross-section",
      label: "Cross-section",
      hint: "A section line kept with the survey.",
      kind: "cross_section",
    },
    { id: "slope", label: "Slope / grade", hint: "Grade between the endpoints.", kind: "slope" },
  ],
  polygon: [
    {
      id: "stockpile",
      label: "Stockpile volume",
      hint: "Volume above a base surface.",
      kind: "stockpile",
      needsBase: true,
    },
    {
      id: "cut-fill",
      label: "Cut / fill",
      hint: "Cut and fill against a base surface.",
      kind: "cut_fill",
      needsBase: true,
    },
    { id: "area", label: "Surface area", hint: "Plan and draped surface area.", kind: "area" },
  ],
};

export function calcTypesFor(mode: "idle" | "probe" | "polyline" | "polygon"): CalcType[] {
  return mode === "idle" ? [] : CALC_TYPES[mode];
}

/** The calc type's kind, ONLY if the type is valid for the geometry mode — a
 * stale polygon pick must not leak onto a freshly drawn line. */
export function kindForCalcType(id: string | null, mode: "polyline" | "polygon"): string | null {
  if (!id) return null;
  return CALC_TYPES[mode].find((t) => t.id === id)?.kind ?? null;
}

/** The mode's first calc — what the panel DISPLAYS as selected when nothing was
 * explicitly picked. The save path uses the same default so the persisted kind
 * always equals what the panel showed. */
export function defaultKindFor(mode: "polyline" | "polygon"): string {
  return CALC_TYPES[mode][0].kind;
}

/** The only kinds orblode-svc computes — and so the only ones offered Compute. */
export function isVolumeKind(kind: string): boolean {
  return kind === "volume" || kind === "stockpile" || kind === "cut_fill";
}

export const VOLUME_METHODS = [
  { id: "smart-base", label: "Smart base" },
  { id: "reference-rl", label: "Reference RL" },
  { id: "previous-survey", label: "Previous survey" },
  { id: "other-survey", label: "Another survey" },
  { id: "design-surface", label: "Design surface" },
] as const;

// Smart base leads every list — the same default the drawing panel and a row
// without a stored method fall back to. Only cut/fill compares against another
// survey: a stockpile "against the previous survey" would just be cut/fill.
const METHODS_FOR_KIND: Record<string, string[]> = {
  stockpile: ["smart-base", "reference-rl"],
  volume: ["smart-base", "reference-rl"],
  cut_fill: ["smart-base", "reference-rl", "previous-survey", "other-survey", "design-surface"],
};

export function methodsForKind(kind: string): { id: string; label: string }[] {
  const ids = METHODS_FOR_KIND[kind] ?? [];
  return ids
    .map((id) => VOLUME_METHODS.find((m) => m.id === id))
    .filter((m): m is (typeof VOLUME_METHODS)[number] => !!m)
    .map((m) => ({ id: m.id, label: m.label }));
}

/** The kind's default base method (first of its list); null for non-volume. */
export function defaultMethodForKind(kind: string): string | null {
  return METHODS_FOR_KIND[kind]?.[0] ?? null;
}

/** Coerce a method state onto a kind: if the current method isn't offered for
 * that kind (e.g. a method this app no longer offers, read back from a stored
 * row), snap to the kind's default so the UI and the persisted params never
 * disagree. */
export function coerceMethodForKind(state: CalcMethodState, kind: string): CalcMethodState {
  const allowed = METHODS_FOR_KIND[kind];
  if (!allowed || allowed.includes(state.method)) return state;
  return { ...state, method: allowed[0] };
}

export type RefMode = "custom" | "lowest_vertex" | "highest_vertex";

export type SurfaceKind = "dsm" | "dtm";

/** The base-surface configuration as edited in the panel / inspector.
 * `surface` is the terrain both sides are read from; `baseSurveyId` and
 * `baseDesignId` are what an "other-survey" or "design-surface" cut/fill
 * compares against. */
export interface CalcMethodState {
  method: string;
  refMode: RefMode;
  refElevation: number | null;
  surface: SurfaceKind;
  baseSurveyId: string | null;
  baseDesignId: string | null;
  /** A material of the project's sheet, for tonnage and value; null for none. */
  materialId: string | null;
}

export const DEFAULT_METHOD_STATE: CalcMethodState = {
  method: "smart-base",
  refMode: "lowest_vertex",
  refElevation: null,
  surface: "dsm",
  baseSurveyId: null,
  baseDesignId: null,
  materialId: null,
};

/** Panel-driven computes request a LEAN render: metrics + receipt only. The
 * §5.2 default (render.heatmap=true) makes every run generate + upload a
 * gdal2tiles pyramid (zooms 14–18) — the dominant wall-clock cost, none of it
 * needed for the number the panel shows. The result-views phase will request
 * {heatmap:true} explicitly when the user opens the 2D cut/fill view. */
export const LEAN_RENDER = { heatmap: false } as const;

/** A user-fixable config problem (missing RL, unknown method) — the caller
 * toasts the message instead of sending an invalid payload. */
export class CalcParamsError extends Error {}

/** Method state → explicit `params.from`/`params.to` SurfaceRefs (§3.1).
 * from = base, to = the current survey's surface. Throws CalcParamsError when
 * the method's required input is missing. */
export function surfaceRefsForMethod(s: CalcMethodState): {
  from: Record<string, unknown>;
  to: Record<string, unknown>;
} {
  const to = { type: "survey_terrain", surface: s.surface };
  switch (s.method) {
    case "smart-base":
      return { from: { type: "smart_base" }, to };
    case "reference-rl":
      if (s.refMode === "custom") {
        if (s.refElevation === null || !Number.isFinite(s.refElevation)) {
          throw new CalcParamsError("Enter a reference elevation in meters (or derive it from the boundary).");
        }
        return { from: { type: "reference_level", elevation_m: s.refElevation }, to };
      }
      return { from: { type: "reference_level", derive: s.refMode }, to };
    case "previous-survey":
      return { from: { type: "previous_survey", surface: s.surface }, to };
    case "other-survey":
      if (!s.baseSurveyId) {
        throw new CalcParamsError("Pick the survey to compare against.");
      }
      return { from: { type: "survey_terrain", survey_id: s.baseSurveyId, surface: s.surface }, to };
    case "design-surface":
      if (!s.baseDesignId) {
        throw new CalcParamsError("Pick the design surface to compare against.");
      }
      return { from: { type: "design", design_id: s.baseDesignId }, to };
    default:
      throw new CalcParamsError(`"${s.method}" is not an instant base method.`);
  }
}

/** The params a volume compute sends for s. Params deep-merge server-side, so
 * no material is sent as material_id "" to clear a stored one. */
export function volumeParams(s: CalcMethodState): Record<string, unknown> {
  const refs = surfaceRefsForMethod(s);
  return { volume_method: s.method, from: refs.from, to: refs.to, render: LEAN_RENDER, material_id: s.materialId ?? "" };
}

/** Cross-survey SurfaceRef pair for Compare Mode (draw-to-compare): from =
 * epoch A ("before"), to = epoch B ("after"), both named explicitly. */
export function crossSurveyRefs(
  aId: string,
  bId: string,
  surface: SurfaceKind = "dsm"
): {
  from: Record<string, unknown>;
  to: Record<string, unknown>;
} {
  return {
    from: { type: "survey_terrain", survey_id: aId, surface },
    to: { type: "survey_terrain", survey_id: bId, surface },
  };
}

/** A cut/fill against a design: its sides read the other way round in
 * earthworks terms (see FeatureInspector's design grid). */
export function hasDesignBase(params: Record<string, unknown> | null | undefined): boolean {
  const from = params?.from;
  return !!from && typeof from === "object" && (from as { type?: unknown }).type === "design";
}

/** Inverse of surfaceRefsForMethod for the inspector: recover the editable
 * method state from a measurement's stored params. Falls back to the legacy
 * display-only `volume_method` string, then to null (no volume config). */
export function methodFromParams(
  params: Record<string, unknown> | null | undefined
): CalcMethodState | null {
  if (!params) return null;
  const from = params.from as Record<string, unknown> | undefined;
  const to = params.to as Record<string, unknown> | undefined;
  const surface: SurfaceKind = to?.surface === "dtm" || from?.surface === "dtm" ? "dtm" : "dsm";
  const materialId = typeof params.material_id === "string" && params.material_id ? params.material_id : null;
  const base = { ...DEFAULT_METHOD_STATE, surface, materialId };
  if (from && typeof from === "object" && typeof from.type === "string") {
    switch (from.type) {
      case "smart_base":
        return { ...base, method: "smart-base" };
      case "reference_level": {
        const elevation = typeof from.elevation_m === "number" ? from.elevation_m : null;
        const derive = from.derive === "highest_vertex" ? "highest_vertex" : "lowest_vertex";
        return {
          ...base,
          method: "reference-rl",
          refMode: elevation !== null ? "custom" : derive,
          refElevation: elevation,
        };
      }
      case "previous_survey":
        return { ...base, method: "previous-survey" };
      case "survey_terrain":
        if (typeof from.survey_id === "string") {
          return { ...base, method: "other-survey", baseSurveyId: from.survey_id };
        }
        break;
      case "design":
        if (typeof from.design_id === "string") {
          return { ...base, method: "design-surface", baseDesignId: from.design_id };
        }
    }
  }
  if (typeof params.volume_method === "string") {
    return { ...DEFAULT_METHOD_STATE, method: params.volume_method, materialId };
  }
  return null;
}

/** The result doc belonging to the measurement's CURRENT kind. Per-kind docs
 * live in `results[kind]` (each calc type remembers its last successful run —
 * the type dropdown is a view switch, never a compute trigger). Legacy rows
 * that predate the map fall back to the single `result` doc, which is safe to
 * attribute because re-templating did not exist when they were written. */
export function resultForKind(m: {
  kind: string;
  result?: MeasurementResultDoc;
  results?: Record<string, MeasurementResultDoc>;
}): MeasurementResultDoc | null {
  const doc = m.results?.[m.kind];
  if (doc) return doc;
  if (m.results && Object.keys(m.results).length > 0) return null; // other kinds computed, not this one
  return m.result ?? null; // legacy single-result row
}

/** Numeric metrics of a measurement result — handles BOTH shapes: the §7.1 v1
 * doc ({version, metrics:{...}, provenance, error}) and legacy flat maps. The
 * doc envelope's `version` must never render as a metric. */
export function metricsOf(result: MeasurementResultDoc | null | undefined): Record<string, number> {
  if (!result || typeof result !== "object") return {};
  const metrics = result.metrics;
  if (metrics && typeof metrics === "object") {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(result)) {
    if (k === "version") continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** The failure block of a v1 result doc, when present. */
export function resultErrorOf(
  result: MeasurementResultDoc | null | undefined
): { class: string; message: string } | null {
  const err = result?.error;
  if (err && typeof err.class === "string" && typeof err.message === "string") {
    return { class: err.class, message: err.message };
  }
  return null;
}

/** The provenance block ("receipt") of a v1 result doc, when present. */
export function provenanceOf(result: MeasurementResultDoc | null | undefined) {
  const prov = result?.provenance;
  if (!prov || typeof prov !== "object") return null;
  return prov;
}

/** How long a measurement may sit in `computing` before the UI offers a FORCED
 * re-run.
 *
 * A row is `computing` only while orblode-svc's daemon runs it in the
 * background, which it allows 10 minutes of PostGIS time; the daemon itself
 * fails a row still computing after 20. In between, the inspector drops the Run
 * row for `computing` and the tree's Play button only shows for draft/failed,
 * so this threshold decides when a re-run (which replaces the queued compute)
 * is offered instead. */
export const STUCK_COMPUTE_MS = 15 * 60_000;

/** True when `m` has been `computing` for longer than {@link STUCK_COMPUTE_MS}.
 * `updated_at` (epoch ms) is the dispatch stamp — the server persists the params
 * and flips the row to `computing` in the same write. `now` is passed in so the
 * caller controls the clock (and so this stays pure/testable). */
export function isComputeStuck(m: { status: string; updated_at?: EpochMs }, now: number): boolean {
  if (m.status !== "computing" || !isEpochMs(m.updated_at)) return false;
  return now - m.updated_at > STUCK_COMPUTE_MS;
}

/** Rough "running for 4 min" copy for the stuck-compute notice. */
export function formatComputeElapsed(m: { updated_at?: EpochMs }, now: number): string {
  if (!isEpochMs(m.updated_at)) return "a while";
  const minutes = Math.max(1, Math.floor((now - m.updated_at) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr`;
}

