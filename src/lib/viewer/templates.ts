// Measurement template catalog (viewer-shell §4.3, decision D6). A static typed
// FE catalog whose ids are stable keys for the Phase-2 BE catalog (task 2.7).
// Each template pre-fills a draw with its backend `kind`, compute `params`
// (SurfaceRefs per surface-ref §3.1), and a folder hint, so the TopToolbar
// split buttons and TemplateMenu (1.3c) land a ready-to-compute measurement.
//
// The catalog is pure data + pure helpers — no React, no Cesium — so it is
// unit-testable directly.

import {
  BanIcon,
  BoxIcon,
  HexagonIcon,
  Layers02Icon,
  MapPinIcon,
  PyramidIcon,
  Route01Icon,
  RulerIcon,
  SplineIcon,
  TrendingUpIcon,
  WavesIcon,
} from "@hugeicons/core-free-icons";
import type { IconDefinition } from "@puckoops/camelot";

import type { Measurement } from "@/lib/api/orblodeSvc";
import type { DrawMode } from "@/lib/viewer/draw";

export interface MeasurementTemplate {
  /** Stable id — the Phase-2 BE catalog key (§4.3). */
  id: string;
  primitive: "point" | "polyline" | "polygon";
  label: string;
  hint?: string;
  icon: IconDefinition;
  /** Exactly one per primitive is the split-button default (§4.3). */
  default?: boolean;
  /** Backend measurement kind, or null for a draw that is not itself a compute
   * (elevation probe, exclusion / blast / hydro polygons). */
  kind: Measurement["kind"] | null;
  folder?: string;
  slope?: boolean;
  /** Pre-filled compute inputs. Omitted where the server's §3.1 defaults apply
   * (e.g. smart-base volume); explicit where §3.1 gives no default (cut_fill). */
  params?: Record<string, unknown>;
}

/**
 * Catalog v1. Kinds are the verified asset-svc enum
 * (`stockpile | volume | cut_fill | cross_section | contour | tin`); templates
 * whose draw is not a compute carry `kind: null`.
 */
export const MEASUREMENT_TEMPLATES: readonly MeasurementTemplate[] = [
  {
    id: "point.elevation",
    primitive: "point",
    label: "Elevation",
    hint: "Sample ground elevation at a point",
    icon: MapPinIcon,
    default: true,
    kind: null, // probe — routes through startProbe, not a saved measurement
  },

  {
    id: "line.distance",
    primitive: "polyline",
    label: "Distance",
    hint: "3D distance along a line",
    icon: RulerIcon,
    default: true,
    kind: "cross_section",
  },
  {
    id: "line.cross-section",
    primitive: "polyline",
    label: "Cross-section",
    hint: "Elevation profile along a line",
    icon: SplineIcon,
    kind: "cross_section",
  },
  {
    id: "line.grade",
    primitive: "polyline",
    label: "Grade",
    hint: "Line distance with running grade / slope",
    icon: TrendingUpIcon,
    kind: "cross_section",
    slope: true,
  },
  {
    id: "line.haul-route",
    primitive: "polyline",
    label: "Haul route",
    hint: "Haul road profile",
    icon: Route01Icon,
    kind: "cross_section",
    folder: "Haul road analysis",
  },

  {
    id: "poly.volume-smart",
    primitive: "polygon",
    label: "Volume",
    hint: "Volume over a smart base surface",
    icon: BoxIcon,
    default: true,
    kind: "volume",
    // params omitted → server §3.1 default (smart_base → survey DSM).
  },
  {
    id: "poly.stockpile",
    primitive: "polygon",
    label: "Stockpile",
    hint: "Stockpile volume",
    icon: PyramidIcon,
    kind: "stockpile",
    folder: "Stockpiles",
  },
  {
    id: "poly.cutfill-previous",
    primitive: "polygon",
    label: "Cut / fill vs previous",
    hint: "Cut and fill against the previous survey",
    icon: Layers02Icon,
    kind: "cut_fill",
    // §3.1 gives cut_fill NO defaults — from/to MUST be explicit (§4.3).
    params: {
      from: { type: "previous_survey", surface: "dsm" },
      to: { type: "survey_terrain", surface: "dsm" },
    },
  },
  {
    id: "poly.area",
    primitive: "polygon",
    label: "Area",
    hint: "Plan area of a polygon",
    icon: HexagonIcon,
    kind: "volume",
  },
  {
    id: "poly.exclusion",
    primitive: "polygon",
    label: "Exclusion zone",
    hint: "Mask a region out of analysis",
    icon: BanIcon,
    kind: null,
    folder: "Blasting",
  },
  {
    id: "poly.blast",
    primitive: "polygon",
    label: "Blast area",
    hint: "Blast polygon",
    icon: WavesIcon, // placeholder blast glyph; swapped for a blast icon in 2.x
    kind: null,
    folder: "Blasting",
  },
  {
    id: "poly.hydro",
    primitive: "polygon",
    label: "Hydro catchment",
    hint: "Hydrology catchment polygon",
    icon: WavesIcon,
    kind: null,
    folder: "Hydro",
  },
];

/** Map a template primitive to a draw mode. `point` templates have no draw mode
 * — they probe (startProbe) rather than draw, so this returns null and the
 * TopToolbar routes accordingly (§4.3). */
export function primitiveToDrawMode(
  primitive: MeasurementTemplate["primitive"]
): DrawMode | null {
  switch (primitive) {
    case "polygon":
      return "polygon";
    case "polyline":
      return "polyline";
    case "point":
      return null;
  }
}

/** All templates for a primitive, catalog order preserved. */
export function templatesForPrimitive(
  primitive: MeasurementTemplate["primitive"]
): MeasurementTemplate[] {
  return MEASUREMENT_TEMPLATES.filter((t) => t.primitive === primitive);
}

/** The default (split-button seed) template for a primitive (§4.3). */
export function defaultTemplateForPrimitive(
  primitive: MeasurementTemplate["primitive"]
): MeasurementTemplate | undefined {
  return MEASUREMENT_TEMPLATES.find((t) => t.primitive === primitive && t.default);
}

/** Look up a template by its stable id. */
export function getTemplate(id: string): MeasurementTemplate | undefined {
  return MEASUREMENT_TEMPLATES.find((t) => t.id === id);
}
