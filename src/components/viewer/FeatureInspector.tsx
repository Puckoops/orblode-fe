"use client";

import * as React from "react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Delete02Icon,
  FileTextIcon,
  FloppyDiskIcon,
  PencilIcon,
  PlayIcon,
  RefreshIcon,
  SplineIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Chip,
  Field,
  Icon,
  IconButton,
  Input,
  Select,
  Skeleton,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type IconDefinition,
} from "@puckoops/camelot";
import { useConfirm } from "@/components/common/confirm";
import { measurementDeleteRequest } from "@/components/viewer/deleteConfirm";
import type { StateStyle } from "@/lib/status";
import { toast } from "@/lib/toast";
import type { EstimateResult, Measurement } from "@/lib/api/orblodeSvc";
import type { PanelMeasurement } from "@/lib/viewer/sampleData";
import { geometryLocalStats } from "@/lib/viewer/measure";
import { CalcConfig } from "@/components/viewer/CalcConfig";
import {
  CalcParamsError,
  DEFAULT_METHOD_STATE,
  calcTypesFor,
  coerceMethodForKind,
  formatComputeElapsed,
  isComputeStuck,
  isVolumeKind,
  methodFromParams,
  LEAN_RENDER,
  metricsOf,
  provenanceOf,
  resultErrorOf,
  resultForKind,
  hasDesignBase,
  surfaceRefsForMethod,
  type CalcMethodState,
} from "@/lib/viewer/calc";
import { useComputeClock } from "@/components/viewer/shell/hooks/useComputeClock";
import { UNIT_SYSTEMS, convertForDisplay, unitSystemOf, type UnitSystem } from "@/lib/viewer/units";
import { STYLE_SWATCHES, styleOf, type MeasurementStyle } from "@/lib/viewer/style";
import { temporalComparePair } from "@/lib/viewer/compare";
import { ComparisonCard } from "@/components/viewer/shell/ComparisonCard";
import { ProfileChart } from "@/components/viewer/ProfileChart";
import { useProfileSeries } from "@/components/viewer/shell/hooks/useProfileSeries";
import { nearestSample, profileUrlOf } from "@/lib/viewer/profile";
import { useViewerStore } from "@/lib/viewer/state/store";
import { formatTimestamp } from "@/lib/time";

// Right contextual inspector — the DESIGN panel (SP-12 mock): header title with
// pencil-rename; a type dropdown (re-template, teardown §2 "type is mutable
// after creation") + units dropdown row; Properties | Style tabs; chips →
// metrics grid (mono) → metadata block (base-method editable via disclosure) →
// icon action ROWS (Receipt · Run compute · Add to report · Save draft ·
// Delete) → STYLE tab: fill/stroke/label
// controls persisted to params.style (PATCH deep-merge) and applied to the
// Cesium entities. Draft-first: draft-ness is a chip + a Save row — never a
// blocking prompt; compute keeps running underneath.

interface FeatureInspectorProps {
  measurement: Measurement | PanelMeasurement | null;
  /** Property bag of a non-measurement feature picked on the map. */
  feature?: Record<string, unknown> | null;
  /** For the design picker in the editable calc config. */
  projectId?: string | null;
  onClose: () => void;
  /** Optional collapse control rendered next to the close button. */
  onCollapse?: () => void;
  /** When true, only the title row is shown (panel chrome stays mounted). */
  collapsed?: boolean;
  /** Promote a draw-first draft: PATCH {name, draft:false}. */
  onSave: (id: string, name: string) => void;
  /** Generic PATCH (rename / re-kind / units / style) + refresh. */
  onPatch?: (
    id: string,
    body: { name?: string; kind?: string; params?: Record<string, unknown>; draft?: boolean }
  ) => Promise<void>;
  onDelete?: (id: string) => void;
  onCompute?: (
    id: string,
    override?: Record<string, unknown>,
    opts?: { force?: boolean }
  ) => void;
  /** Enter the vertex-drag geometry editor for this measurement (Line tool lit
   * as the edit indicator); double-click on the map commits + recomputes. */
  onEditGeometry?: () => void;
  /** v2 only: commit the active geometry edit (the "Done editing" twin of Enter
   * / double-click). Present regardless of flag; the button only shows while the
   * v2 machine is editing THIS measurement. */
  onCommitGeometry?: () => void;
  /** v2 only: the id of the measurement whose geometry is being edited right now
   * (from the interaction machine), else null. When it matches this measurement,
   * the inspector shows "Done editing" instead of "Edit shape". */
  editingGeometryId?: string | null;
  /** The instant PostGIS estimate for this measurement's current kind, shown
   * (with an "Instant" badge) until the authoritative worker doc lands. */
  estimate?: EstimateResult | null;
  /** Drop the stale estimate (called when the kind/method changes). */
  onClearEstimate?: () => void;
  saving: boolean;
  /** A compute/delete request for this measurement is in flight. */
  busy?: boolean;
}

// The total_*/delta_*/profile_* keys are what the compute processors actually
// emit into measurement.result; the bare keys cover client-side plan stats.
const METRIC_LABELS: [key: string, label: string][] = [
  ["total_volume_m3", "Volume"],
  ["total_adjusted_volume_m3", "Adj. volume"],
  ["total_tonnage_t", "Tonnage"],
  ["delta_volume_m3", "Δ volume"],
  ["delta_tonnage_t", "Δ tonnage"],
  ["active_pile_count", "Piles"],
  ["volume_m3", "Volume"],
  ["adjusted_volume_m3", "Adj. volume"],
  ["tonnage_t", "Tonnage"],
  ["area_m2", "Area"],
  ["perimeter_m", "Perimeter"],
  ["length_m", "Length"],
  ["grade_percent", "Grade"],
  ["cut_volume_m3", "Cut"],
  ["fill_volume_m3", "Fill"],
  ["net_change_m3", "Net change"],
  ["total_moved_m3", "Moved"],
  ["profile_length_m", "Profile length"],
  ["profile_point_count", "Samples"],
];

// Per-kind curated grids — the compute/estimate metric map carries the FULL
// worker-parity set (cut/fill/net/moved split, material-adjusted splits,
// sample_count) for every volume result, but a panel shows only the headline
// numbers for that kind. For a stockpile the cut/fill/net/moved keys just
// restate Volume, so they are deliberately omitted here.
const METRICS_BY_KIND: Record<string, [key: string, label: string][]> = {
  volume: [["volume_m3", "Volume"], ["fill_tonnage_t", "Tonnage"], ["area_m2", "Area"]],
  stockpile: [["volume_m3", "Volume"], ["fill_tonnage_t", "Tonnage"], ["area_m2", "Area"]],
  cut_fill: [
    ["cut_volume_m3", "Cut"],
    ["fill_volume_m3", "Fill"],
    ["net_change_m3", "Net change"],
    ["area_m2", "Area"],
  ],
};

// ORB-54 — Cut/Fill against a DESIGN base are relabelled (and therefore
// swapped), because the engine's labels are mechanical while the panel's are
// earthworks terms.
//
// A design comparison dispatches from = design, to = as-built survey
// (lib/viewer/calc.ts surfaceRefsForMethod, case "design-surface"). The engine
// differences Δ = TO − FROM and buckets purely by sign — workflow-geo-svc
// cutfillengine/compute.py: `diff_raw = arr_b - arr_a` with
// dsm_a = BaselinePath = FROM, then `cut = Σ max(−Δ,0)`, `fill = Σ max(Δ,0)`.
// With the design in the FROM slot that means:
//
//   fill_volume_m3 = Σ max(as-built − design, 0) = material ABOVE design = OVER-built
//   cut_volume_m3  = Σ max(design − as-built, 0) = voids BELOW design    = UNDER-built
//
// Earthworks naming runs the other way: over-built material is what you CUT to
// reach design, and an under-built void is what you FILL. So the two source
// keys are exchanged for display.
//
// This is a presentation relabel, NOT a claim that the engine is inverted: a
// design surface is rasterized into the same from/to slot any terrain base
// would occupy (volumecompute/stage1.py `out_paths[role] = design_path`), with
// no design-specific arithmetic anywhere. The engine's own design golden says
// the naming is ours to own, and pins the direction: a z=51 design pad over a
// z=50 plane carrying a z=52 prism yields cut=1900 (the below-design plane) and
// fill=600 (the above-design prism) — see
// cutfillengine/goldens/design_goldens_test.go TestGolden17DesignFlatPad, and
// TestGolden17DesignSwap for the from/to symmetry.
//
// Scope: `design-surface` is only offered for the cut_fill kind
// (calc.ts METHODS_FOR_KIND), and the adjusted/tonnage splits are not surfaced
// in this grid, so these four rows are the entire swap surface.
const METRICS_CUT_FILL_DESIGN: [key: string, label: string][] = [
  ["fill_volume_m3", "Cut to design"],
  ["cut_volume_m3", "Fill to design"],
  // net_change_m3 = engine fill − engine cut = displayed Cut − displayed Fill.
  // The label states that arithmetic so the sign can't be misread against the
  // two swapped rows above it.
  ["net_change_m3", "Net (cut − fill)"],
  ["area_m2", "Area"],
];

// Internal / debug metrics never shown in the grid (they are provenance, not
// results — sample_count, and the material-adjusted splits which surface as
// Tonnage instead).
const HIDDEN_METRICS = new Set([
  "sample_count",
  "cut_adjusted_volume_m3",
  "fill_adjusted_volume_m3",
]);

function formatMetric(value: number): string {
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 10 ? 1 : 0;
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "haul_distance_m" → "Haul distance" for result keys we don't know (the unit
 * suffix is dropped — convertForDisplay re-attaches the display unit). */
function prettifyKey(key: string): string {
  const words = key
    .replace(/_(m3|m2|t|m|percent|count)$/, "")
    .replace(/_/g, " ")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Metric map → display rows, converted into the measurement's unit system.
 * A `kind` with a curated grid shows ONLY that grid; other kinds fall back to
 * the generic label table plus any remaining (non-internal) keys.
 * `designBase` switches cut_fill onto the earthworks-named grid (ORB-54). */
function resultMetrics(
  result: Record<string, number>,
  system: UnitSystem,
  kind?: string,
  designBase = false
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  const push = (key: string, label: string, value: number) => {
    const c = convertForDisplay(key, value, system);
    rows.push({ label, value: `${formatMetric(c.value)}${c.unit ? ` ${c.unit}` : ""}` });
  };
  const curated =
    designBase && kind === "cut_fill"
      ? METRICS_CUT_FILL_DESIGN
      : kind
        ? METRICS_BY_KIND[kind]
        : undefined;
  for (const [key, label] of curated ?? METRIC_LABELS) {
    const value = result[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      push(key, label, value);
      seen.add(key);
    }
  }
  if (curated) return rows; // curated kinds surface only their headline set
  for (const [key, value] of Object.entries(result)) {
    if (seen.has(key) || HIDDEN_METRICS.has(key) || typeof value !== "number" || !Number.isFinite(value))
      continue;
    push(key, prettifyKey(key), value);
  }
  return rows;
}

// Status chip — design language: completed reads as "Approved".
const STATUS_CHIPS: Record<string, StateStyle> = {
  completed: { label: "Approved", tone: "teal", glyph: "check" },
  computing: { label: "Computing", tone: "blue", glyph: "circle-half" },
  failed: { label: "Failed", tone: "red", glyph: "triangle" },
  draft: { label: "Not computed", tone: "neutral", glyph: "circle-dashed" },
};

function StatusChip({ status, demo }: { status: string; demo?: boolean }) {
  const state = STATUS_CHIPS[demo ? "completed" : status] ?? { ...STATUS_CHIPS.draft, label: status };
  return (
    <Chip tone={state.tone} glyph={state.glyph}>
      {state.label}
    </Chip>
  );
}

function MetricsGrid({ metrics }: { metrics: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-md border border-hairline bg-surface-2 p-3">
      {metrics.map((m) => (
        <div key={m.label}>
          <dt className="caption text-ink-4">{m.label}</dt>
          <dd className="num font-medium text-ink-1">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Design action row: icon + label left, chevron right. */
function ActionRow({
  icon,
  label,
  onClick,
  primary = false,
  disabled = false,
  loading = false,
  chevron = ArrowRight01Icon,
  expanded,
}: {
  icon: IconDefinition;
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
  chevron?: IconDefinition;
  expanded?: boolean;
}) {
  return (
    <Button
      variant={primary ? "primary" : "quiet"}
      iconStart={icon}
      iconEnd={chevron}
      disabled={disabled}
      loading={loading}
      aria-expanded={expanded}
      onClick={onClick}
      className="w-full justify-start [&>svg:last-child]:ml-auto"
    >
      {label}
    </Button>
  );
}

/** Swatch strip for the STYLE tab: the measurement colours a person can pick. */
function SwatchRow({ value, onPick, label }: { value: string; onPick: (color: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="caps mb-1.5 text-ink-4">{label}</p>
      <div className="flex gap-2">
        {STYLE_SWATCHES.map((c) => {
          const selected = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label}: ${c}`}
              onClick={() => onPick(c)}
              className={`size-7 rounded-sm border transition-transform hover:scale-110 ${
                selected ? "border-ink-1 ring-2 ring-hairline-strong" : "border-hairline-strong"
              }`}
              style={{ backgroundColor: c }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Collapse + close controls shared by both inspector views. */
function PanelControls({ collapsed, onCollapse, onClose }: { collapsed: boolean; onCollapse?: () => void; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {onCollapse && (
        <IconButton
          icon={collapsed ? ArrowUp01Icon : ArrowDown01Icon}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          aria-expanded={!collapsed}
          variant="bare"
          size="sm"
          onClick={onCollapse}
        />
      )}
      <IconButton icon={Cancel01Icon} aria-label="Close" variant="bare" size="sm" onClick={onClose} />
    </div>
  );
}

/** Property inspector for a picked, non-measurement map feature. */
function PickedFeatureView({
  feature,
  onClose,
  onCollapse,
  collapsed = false,
}: {
  feature: Record<string, unknown>;
  onClose: () => void;
  onCollapse?: () => void;
  collapsed?: boolean;
}) {
  const entries = Object.entries(feature).filter(([key, value]) => !key.startsWith("_") && (typeof value !== "object" || value === null));

  return (
    <div className={`flex flex-col p-3 ${collapsed ? "" : "h-full min-h-0 gap-3"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="caps text-ink-4">Selected feature</p>
          <h3 className="h3 truncate text-ink-1">{String(feature.name ?? feature.id ?? "Unnamed feature")}</h3>
        </div>
        <PanelControls collapsed={collapsed} onCollapse={onCollapse} onClose={onClose} />
      </div>

      {!collapsed && (
        <>
          <Badge variant="tag" className="self-start">
            {String(feature._source ?? "feature")}
          </Badge>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <dl className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-2 p-3">
              {entries.length === 0 && <p className="caption text-ink-4">This feature carries no properties.</p>}
              {entries.map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-3">
                  <dt className="caption shrink-0 text-ink-4">{key}</dt>
                  <dd className="num-sm truncate text-right text-ink-1">{String(value)}</dd>
                </div>
              ))}
            </dl>

            <pre className="num-sm rounded-md border border-hairline bg-surface-2 p-2.5 break-all whitespace-pre-wrap text-ink-3">
              {JSON.stringify(feature, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

export function FeatureInspector({
  measurement,
  feature,
  projectId = null,
  onClose,
  onCollapse,
  collapsed = false,
  onSave,
  onPatch,
  onDelete,
  onCompute,
  onEditGeometry,
  onCommitGeometry,
  editingGeometryId = null,
  estimate,
  onClearEstimate,
  saving,
  busy,
}: FeatureInspectorProps) {
  const [name, setName] = React.useState(measurement?.name || "");
  const [renaming, setRenaming] = React.useState(false);
  // Editable base-method config, seeded from the stored params (lazy initializer
  // — the render-time reset below only fires on measurement SWITCH, not first
  // mount); null unless the measurement is volume-kind.
  const seedCalcCfg = (m: typeof measurement) =>
    m && isVolumeKind(m.kind)
      ? coerceMethodForKind(methodFromParams(m.params) ?? DEFAULT_METHOD_STATE, m.kind)
      : null;
  const [calcCfg, setCalcCfg] = React.useState<CalcMethodState | null>(() => seedCalcCfg(measurement));
  const [editBase, setEditBase] = React.useState(false);
  const [showReceipt, setShowReceipt] = React.useState(false);
  // STYLE tab local state — seeded from params.style, PATCHed (debounced).
  const [style, setStyle] = React.useState<MeasurementStyle>(() => styleOf(measurement?.params));
  const styleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prevId, setPrevId] = React.useState(measurement?.id);
  // ORB-37: delete is gated behind a confirmation. Declared above the early
  // returns below so the hook order stays stable across feature/measurement.
  const { confirm, confirmDialog } = useConfirm();
  // ORB-39: local clock so the stuck-compute affordance can appear while this
  // measurement sits in `computing` with no data changing underneath it.
  const now = useComputeClock(measurement?.status === "computing");
  // FR-09 — the elevation series behind the profile chart. Resolved here, ABOVE
  // the early returns, so the hook order stays stable whether the panel is
  // showing a measurement, a picked map feature, or nothing. A non-cross-section
  // yields a null url and the hook is inert (no fetch, no state).
  const profileUrl =
    measurement && measurement.kind === "cross_section"
      ? profileUrlOf(resultForKind(measurement))
      : null;
  const profile = useProfileSeries(profileUrl);
  const profileHover = useViewerStore((s) => s.profileHover);
  const setProfileHover = useViewerStore((s) => s.setProfileHover);

  // Reset the editable state when a different feature is selected. Adjusting
  // state during render (instead of in an effect) avoids the cascading
  // re-render the effect caused — https://react.dev/learn/you-might-not-need-an-effect
  if (measurement?.id !== prevId) {
    setPrevId(measurement?.id);
    setName(measurement?.name || "");
    setRenaming(false);
    setCalcCfg(seedCalcCfg(measurement));
    setEditBase(false);
    setShowReceipt(false);
    setStyle(styleOf(measurement?.params));
  }

  if (feature) {
    return (
      <PickedFeatureView feature={feature} onClose={onClose} onCollapse={onCollapse} collapsed={collapsed} />
    );
  }
  if (!measurement) return null;

  const demo = (measurement as PanelMeasurement).demo === true;
  const isDraft = !demo && measurement.draft === true;
  const isVolume = isVolumeKind(measurement.kind);
  // Compare Mode: a temporal compare (params.from/to name two different
  // surveys) gets the A→B comparison card headline in the Properties tab.
  const comparePair = demo ? null : temporalComparePair(measurement.params);
  const canPatch = !demo && !!onPatch;
  // Kinds the backend actually dispatches (processorForKind): the volume family
  // via the resolved path, and cross_section via the explicit profile-extract
  // payload ViewerCanvas builds. Anything else gets no Run row rather than a 422
  // toast. Completed rows may re-run (edit method → recompute); the in-flight
  // 409 gate covers the computing state.
  const isDispatchable = isVolume || measurement.kind === "cross_section";
  const canCompute = !demo && isDispatchable && measurement.status !== "computing";
  // ORB-39: once a compute job dies server-side the row is stranded in
  // `computing` — the Run row above is hidden and the tree's Play button only
  // shows for draft/failed, so nothing can restart it. After a few minutes,
  // offer a re-dispatch that sets `force` to bypass the in-flight 409.
  const computeStuck = !demo && isDispatchable && isComputeStuck(measurement, now);
  // Vertex-drag editing needs a real (non-demo) polygon/line and the handler.
  const geomType = measurement.geometry?.type;
  const canEditGeometry =
    !demo && !!onEditGeometry && (geomType === "Polygon" || geomType === "LineString");
  // v2: this measurement's geometry is being edited right now → the action row
  // becomes "Done editing" (commit) instead of "Edit shape" (start).
  const isEditingThis = !!editingGeometryId && editingGeometryId === measurement.id;

  const unitSystem = unitSystemOf(measurement.params);
  const material = (measurement.params?.material ?? null) as {
    name?: string;
    density_t_m3?: number;
  } | null;

  // The type dropdown is a VIEW switch: show the doc stored for the CURRENT
  // kind (results[kind]); other kinds keep theirs. No doc for this kind →
  // plan stats + "Run compute". The LATEST run's error (legacy result column)
  // is only surfaced when this kind has no successful doc to show.
  const doc = demo ? null : resultForKind(measurement);
  const resultMetricMap = metricsOf(doc);
  const computing = measurement.status === "computing";
  const showFailure = !demo && measurement.status === "failed" && !doc;
  // Instant estimate fills the panel before the authoritative worker doc lands.
  // It wins whenever there is no doc yet OR a (re-)compute is in flight — during
  // a re-run the estimate reflects the PENDING params, so it should supersede
  // the now-stale prior doc. A settled doc (not computing) wins; a failure wins.
  const estimateMetricMap =
    !demo && !showFailure && (!doc || computing) && estimate && Object.keys(estimate.metrics).length > 0
      ? estimate.metrics
      : null;
  const showingEstimate = !!estimateMetricMap;
  const localStats =
    !demo && !doc && !showingEstimate && measurement.geometry
      ? geometryLocalStats(measurement.geometry)
      : null;
  // ORB-54: a design base flips the panel onto earthworks Cut/Fill naming.
  const designBase = !demo && hasDesignBase(measurement.params);
  const designCutFill = designBase && measurement.kind === "cut_fill";
  const metrics = demo
    ? [
        { label: "Volume", value: "12,840 m³" },
        { label: "Tonnage", value: "32,100 t" },
        { label: "Area", value: "1,420 m²" },
        { label: "Perimeter", value: "142 m" },
      ]
    : resultMetrics(
        localStats ?? estimateMetricMap ?? resultMetricMap,
        unitSystem,
        measurement.kind,
        designBase
      );

  const computeError = showFailure ? resultErrorOf(measurement.result) : null;
  const receipt = demo ? null : provenanceOf(doc);
  // Chip reflects the SELECTED kind: computing (row-level) → this kind's doc →
  // last-run failure → not computed yet.
  const chipStatus = computing ? "computing" : doc ? "completed" : showFailure ? "failed" : "draft";
  const calcStamp = formatTimestamp(measurement.updated_at);

  // Type dropdown: the geometry's calc types; the stored kind rides along even
  // if it predates the catalog (legacy "volume") so the select never lies.
  const geomMode = measurement.geometry?.type === "LineString" ? "polyline" : "polygon";
  const typeOptions = calcTypesFor(geomMode).map((t) => ({ value: t.kind, label: t.label }));
  if (!typeOptions.some((o) => o.value === measurement.kind)) {
    typeOptions.unshift({ value: measurement.kind, label: prettifyKey(measurement.kind) });
  }

  const commitRename = () => {
    setRenaming(false);
    const next = name.trim();
    if (!next || next === measurement.name) {
      setName(measurement.name);
      return;
    }
    if (canPatch) void onPatch!(measurement.id, { name: next }).catch(() => setName(measurement.name));
  };

  const changeType = (kind: string) => {
    if (!canPatch || kind === measurement.kind) return;
    onClearEstimate?.(); // the old kind's instant number no longer applies
    const params: Record<string, unknown> = {};
    if (isVolumeKind(kind)) {
      // Re-templating snaps the base method onto the new kind's list (a
      // stockpile's smart base becomes cut/fill's previous survey, etc.).
      const cfg = coerceMethodForKind(calcCfg ?? DEFAULT_METHOD_STATE, kind);
      try {
        const refs = surfaceRefsForMethod(cfg);
        params.volume_method = cfg.method;
        params.from = refs.from;
        params.to = refs.to;
        params.render = LEAN_RENDER;
      } catch (err) {
        if (err instanceof CalcParamsError) {
          toast.warning(err.message);
          return;
        }
        throw err;
      }
      setCalcCfg(cfg);
    }
    // NO auto-compute: the dropdown is a view switch (the new kind shows its
    // stored doc, or "Run compute"). Computing is always the explicit row.
    void onPatch!(measurement.id, { kind, ...(Object.keys(params).length ? { params } : {}) }).catch(
      () => undefined
    );
  };

  const changeUnits = (v: string) => {
    if (canPatch && v !== unitSystem) {
      void onPatch!(measurement.id, { params: { units: v } }).catch(() => undefined);
    }
  };

  const patchStyle = (patch: Partial<MeasurementStyle>) => {
    const next = { ...style, ...patch };
    setStyle(next);
    if (!canPatch) return;
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = setTimeout(() => {
      void onPatch!(measurement.id, { params: { style: next } }).catch(() => undefined);
    }, 600);
  };

  const runCompute = (opts?: { force?: boolean }) => {
    if (!onCompute) return;
    // Volume kinds always send the edited config as the override — the backend
    // persists the merge, so the row states what ran (§6.1).
    if (isVolume && calcCfg) {
      try {
        const refs = surfaceRefsForMethod(calcCfg);
        onCompute(
          measurement.id,
          {
            volume_method: calcCfg.method,
            from: refs.from,
            to: refs.to,
            // Lean run: skip the gdal2tiles pyramid — the panel needs the
            // number + receipt; heatmap tiles are the result-views phase.
            render: LEAN_RENDER,
          },
          opts
        );
      } catch (err) {
        if (err instanceof CalcParamsError) toast.warning(err.message);
        else throw err;
      }
      return;
    }
    onCompute(measurement.id, undefined, opts);
  };

  const runLabel = doc ? "Re-run compute" : "Run compute";

  return (
    <div className={`flex flex-col p-3 ${collapsed ? "" : "h-full min-h-0 gap-3"}`}>
      {/* Header — name (pencil to rename, teardown §10) + collapse/close. */}
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <Input
            autoFocus
            aria-label="Measurement name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(measurement.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="group flex min-w-0 items-center gap-2 text-left"
            onClick={() => canPatch && setRenaming(true)}
            title={canPatch ? "Rename" : undefined}
          >
            <h3 className="h3 min-w-0 truncate text-ink-1">{measurement.name}</h3>
            {canPatch && <Icon icon={PencilIcon} size={16} className="shrink-0 text-ink-4 group-hover:text-ink-2" />}
          </button>
        )}
        <PanelControls collapsed={collapsed} onCollapse={onCollapse} onClose={onClose} />
      </div>

      {!collapsed && (
        <>
          {/* Type + Units dropdown row (design row 2). */}
          <div className="flex gap-2">
            <Select aria-label="Measurement type" value={measurement.kind} onValueChange={changeType} options={typeOptions} className="min-w-0 flex-1" />
            <Select
              aria-label="Units"
              value={unitSystem}
              onValueChange={changeUnits}
              options={UNIT_SYSTEMS.map((u) => ({ value: u.id, label: u.label }))}
              className="min-w-0 flex-1"
            />
          </div>

          <Tabs variant="segmented" defaultValue="properties" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="style">Style</TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {isDraft && (
                  <Chip tone="amber" glyph="circle-dashed">
                    Draft
                  </Chip>
                )}
                <StatusChip status={chipStatus} demo={demo} />
                {(demo || material?.name) && <Badge variant="tag">{demo ? "Limestone" : material!.name}</Badge>}
                {measurement.folder && <Badge variant="tag">{measurement.folder}</Badge>}
              </div>

              {/* Compare Mode headline — A→B epochs + cut/fill/net Δ. Only for a
                  temporal compare; ordinary measurements skip it (and its fetch). */}
              {comparePair && <ComparisonCard measurement={measurement} projectId={projectId} pair={comparePair} />}

              {/* Failure reason — the LATEST run's error, only while the
                  selected kind has no successful doc of its own. */}
              {showFailure && (
                <Alert tone="critical" title={`Compute failed${computeError ? ` · ${computeError.class.replace(/_/g, " ")}` : ""}`}>
                  {computeError?.message ?? "No failure detail was recorded for this run. Re-run compute to retry."}
                </Alert>
              )}

              {metrics.length > 0 ? (
                <MetricsGrid metrics={metrics} />
              ) : (
                !showFailure && (
                  <p className="caption rounded-md border border-hairline bg-surface-2 p-3 text-ink-4">
                    {computing ? "Computing — results will appear here shortly." : "Nothing computed yet. Run compute to populate volume and area."}
                  </p>
                )
              )}

              {/* FR-09 — the cross-section chart, directly under its numbers.
                  Only a cross_section reaches any of these branches; every other
                  kind leaves profileUrl null and renders nothing. */}
              {measurement.kind === "cross_section" && !demo && (
                <>
                  {profile.series && (
                    <ProfileChart
                      series={profile.series}
                      system={unitSystem}
                      // The scene drives the marker only when IT is the mover;
                      // echoing the chart's own hover back would fight the cursor.
                      externalIndex={
                        profileHover?.source === "scene" ? (nearestSample(profile.series, profileHover.chainage)?.index ?? null) : null
                      }
                      onHoverStation={(sample) => setProfileHover(sample ? { chainage: sample.distanceM, source: "chart" } : null)}
                    />
                  )}
                  {profile.loading && <Skeleton width="100%" height={180} radius="var(--radius-md)" />}
                  {profile.error && (
                    <Alert tone="warning" title="Couldn't load the profile">
                      {profile.error}
                    </Alert>
                  )}
                  {!profileUrl && !computing && !showFailure && (
                    <p className="caption rounded-md border border-hairline bg-surface-2 p-3 text-ink-4">
                      No profile yet. Run compute to sample the surface along this line.
                    </p>
                  )}
                </>
              )}

              {showingEstimate && (
                <div className="-mt-1 flex items-center gap-1.5">
                  <Chip tone="blue" glyph="diamond">
                    Instant
                  </Chip>
                  <span className="caption text-ink-4">
                    {computing
                      ? `PostGIS · ${estimate?.provenance.query_ms ?? 0} ms — refining with the full compute…`
                      : "PostGIS estimate · Run compute for the authoritative result."}
                  </span>
                </div>
              )}

              {localStats && metrics.length > 0 && (
                <p className="caption -mt-1 text-ink-4">Plan values measured from the drawn geometry — run compute for surface-true results.</p>
              )}

              {/* ORB-54: state the convention explicitly — these two rows read
                  against the design, which is the opposite sense to a
                  survey-to-survey compare. */}
              {designCutFill && !localStats && metrics.length > 0 && (
                <p className="caption -mt-1 text-ink-4">
                  Measured against the design surface: <span className="text-ink-2">Cut</span> is material sitting above design (to remove),{" "}
                  <span className="text-ink-2">Fill</span> is volume still below it (to add).
                </p>
              )}

              {/* Metadata block (design): Material / Density / Base method /
                  Calculated. Base method discloses the shared CalcConfig. */}
              <div className="caption flex flex-col gap-1 text-ink-3">
                {(demo || material?.name) && (
                  <p>
                    Material: <span className="text-ink-2">{demo ? "Limestone" : material!.name}</span>
                  </p>
                )}
                {(demo || material?.density_t_m3) && (
                  <p>
                    Density: <span className="num-sm text-ink-2">{demo ? "2.5" : material!.density_t_m3} t/m³</span>
                  </p>
                )}
                {isVolume && calcCfg && (
                  <button type="button" className="group flex items-center gap-1 text-left" onClick={() => setEditBase((v) => !v)} aria-expanded={editBase}>
                    Base method: <span className="text-ink-2 capitalize">{calcCfg.method.replace(/-/g, " ")}</span>
                    <Icon icon={editBase ? ArrowDown01Icon : ArrowRight01Icon} size={16} className="text-ink-4 group-hover:text-ink-3" />
                  </button>
                )}
                {calcStamp && (
                  <p>
                    Calculated: <span className="num-sm text-ink-2">{calcStamp}</span>
                  </p>
                )}
              </div>

              {/* Disclosed base-method editor — same component as the drawing
                  panel; edits ride the next Run compute as the §6.1 override. */}
              {editBase && isVolume && calcCfg && !demo && (
                <div className="rounded-md border border-hairline bg-surface-2 p-2.5">
                  <CalcConfig
                    idPrefix="inspect"
                    kind={measurement.kind}
                    projectId={projectId}
                    value={calcCfg}
                    onChange={(patch) => setCalcCfg((c) => ({ ...(c ?? DEFAULT_METHOD_STATE), ...patch }))}
                  />
                </div>
              )}

              {/* Action rows (design): Receipt · Run · Save (drafts) · Delete. */}
              <div className="mt-auto flex flex-col gap-2">
                {receipt && (
                  <ActionRow
                    icon={FileTextIcon}
                    label="Receipt"
                    expanded={showReceipt}
                    onClick={() => setShowReceipt((v) => !v)}
                    chevron={showReceipt ? ArrowDown01Icon : ArrowRight01Icon}
                  />
                )}
                {showReceipt && receipt && (
                  <div className="caption flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-2 p-2.5 text-ink-3">
                    {receipt.processor && (
                      <p>
                        <span className="text-ink-4">Processor:</span> {receipt.processor}
                      </p>
                    )}
                    {receipt.tools && Object.keys(receipt.tools).length > 0 && (
                      <p>
                        <span className="text-ink-4">Tools:</span>{" "}
                        {Object.entries(receipt.tools)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                    {receipt.effective !== undefined && (
                      <>
                        <p className="text-ink-4">Effective parameters (as run):</p>
                        <pre className="num-sm max-h-44 overflow-auto rounded-xs bg-surface-3 p-2 break-all whitespace-pre-wrap text-ink-3">
                          {JSON.stringify(receipt.effective, null, 2)}
                        </pre>
                      </>
                    )}
                  </div>
                )}
                {canEditGeometry && !isEditingThis && <ActionRow icon={SplineIcon} label="Edit shape" onClick={() => onEditGeometry!()} />}
                {isEditingThis && onCommitGeometry && <ActionRow primary icon={Tick02Icon} label="Done editing" onClick={() => onCommitGeometry()} />}
                {canCompute && onCompute && <ActionRow icon={PlayIcon} label={runLabel} onClick={() => runCompute()} loading={busy} />}
                {/* Stuck-compute recovery (ORB-39) — the only route back for a
                    row whose worker died: every other Run affordance is hidden
                    while status is `computing`. */}
                {computeStuck && onCompute && (
                  <>
                    <Alert tone="warning" title={`Computing for ${formatComputeElapsed(measurement, now)}`}>
                      That is well past a normal run. If the job died server-side the row stays like this indefinitely — a forced re-run dispatches it
                      again.
                    </Alert>
                    <ActionRow icon={RefreshIcon} label="Force re-run" onClick={() => runCompute({ force: true })} loading={busy} />
                  </>
                )}
                {isDraft && (
                  <ActionRow
                    primary
                    icon={FloppyDiskIcon}
                    label={saving ? "Saving…" : "Save measurement"}
                    onClick={() => onSave(measurement.id, name.trim() || measurement.name)}
                    loading={saving}
                  />
                )}
                {!demo && onDelete && (
                  <Button
                    variant="ghost"
                    iconStart={Delete02Icon}
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        measurementDeleteRequest({ name: measurement.name, draft: isDraft }, () => {
                          onDelete(measurement.id);
                          onClose();
                        })
                      )
                    }
                    className="w-full justify-start"
                  >
                    {isDraft ? "Discard draft" : "Delete"}
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* STYLE tab (design): fill/opacity, stroke color/width/style,
                label visibility/field/size → params.style via debounced PATCH. */}
            <TabsContent value="style" className="mt-2 min-h-0 flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 pb-2">
                <SwatchRow label="Fill color" value={style.fill} onPick={(fill) => patchStyle({ fill })} />
                <Slider
                  label="Opacity"
                  value={[style.fillOpacity]}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onValueChange={([v]) => patchStyle({ fillOpacity: v })}
                />
                <SwatchRow label="Stroke color" value={style.stroke} onPick={(stroke) => patchStyle({ stroke })} />
                <Slider
                  label="Stroke width"
                  value={[style.strokeWidth]}
                  min={1}
                  max={10}
                  step={1}
                  format={(v) => `${v} px`}
                  onValueChange={([v]) => patchStyle({ strokeWidth: v })}
                />
                <Field label="Stroke style">
                  <Select
                    value={style.strokeStyle}
                    onValueChange={(v) => patchStyle({ strokeStyle: v as MeasurementStyle["strokeStyle"] })}
                    options={[
                      { value: "solid", label: "Solid" },
                      { value: "dashed", label: "Dashed" },
                      { value: "dotted", label: "Dotted" },
                    ]}
                  />
                </Field>
                <Checkbox label="Show label" checked={style.labelVisible} onCheckedChange={(v) => patchStyle({ labelVisible: v })} />
                <Field label="Label field">
                  <Select
                    value={style.labelField}
                    onValueChange={(v) => patchStyle({ labelField: v as MeasurementStyle["labelField"] })}
                    options={[
                      { value: "name", label: "Name" },
                      { value: "volume", label: "Volume" },
                      { value: "none", label: "None" },
                    ]}
                  />
                </Field>
                <Slider
                  label="Label size"
                  value={[style.labelSize]}
                  min={9}
                  max={24}
                  step={1}
                  format={(v) => `${v} px`}
                  onValueChange={([v]) => patchStyle({ labelSize: v })}
                />
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
      {confirmDialog}
    </div>
  );
}
