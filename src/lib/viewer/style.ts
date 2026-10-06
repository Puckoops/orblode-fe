// Per-measurement render style (design panel STYLE tab: fill + opacity, stroke
// color/width/style, label visibility/field/size). Persisted on the row as
// `params.style` (a partial object over these defaults — the Go params decoder
// ignores unknown keys, and PATCH deep-merges, so style edits never clobber
// compute params). Applied to the Cesium entities in useLayerLifecycle's
// measurement-rendering effect.

import { MEASUREMENT_SWATCHES } from "./sceneStyle.ts";

export interface MeasurementStyle {
  fill: string;
  fillOpacity: number; // 0..1
  stroke: string;
  strokeWidth: number; // px
  strokeStyle: "solid" | "dashed" | "dotted";
  labelVisible: boolean;
  labelField: "name" | "volume" | "none";
  labelSize: number; // px
}

// Accent first — matches the app's default measurement render.
export const STYLE_SWATCHES = MEASUREMENT_SWATCHES;

export const DEFAULT_STYLE: MeasurementStyle = {
  fill: MEASUREMENT_SWATCHES[0],
  fillOpacity: 0.25,
  stroke: MEASUREMENT_SWATCHES[0],
  strokeWidth: 3,
  strokeStyle: "solid",
  labelVisible: false,
  labelField: "name",
  labelSize: 13,
};

/** Parse a measurement's stored style (partial, unknown-shaped) over the
 * defaults. Tolerates junk — a bad field falls back to its default. */
export function styleOf(params: Record<string, unknown> | null | undefined): MeasurementStyle {
  const raw = (params?.style ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const color = (v: unknown, d: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d;
  return {
    fill: color(raw.fill, DEFAULT_STYLE.fill),
    fillOpacity: num(raw.fillOpacity, DEFAULT_STYLE.fillOpacity, 0, 1),
    stroke: color(raw.stroke, DEFAULT_STYLE.stroke),
    strokeWidth: num(raw.strokeWidth, DEFAULT_STYLE.strokeWidth, 1, 10),
    strokeStyle:
      raw.strokeStyle === "dashed" || raw.strokeStyle === "dotted" ? raw.strokeStyle : "solid",
    labelVisible: raw.labelVisible === true,
    labelField: raw.labelField === "volume" || raw.labelField === "none" ? raw.labelField : "name",
    labelSize: num(raw.labelSize, DEFAULT_STYLE.labelSize, 9, 24),
  };
}
