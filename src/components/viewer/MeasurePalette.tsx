"use client";

import { useId } from "react";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { IconButton, RadioGroup } from "@puckoops/camelot";

import { CalcConfig } from "@/components/viewer/CalcConfig";
import { calcTypesFor, coerceMethodForKind } from "@/lib/viewer/calc";
import { useViewerStore } from "@/lib/viewer/state/store";
import { formatArea, formatDistance, type LngLatHeight } from "@/lib/viewer/measure";

// The right-panel CALCULATION module (RE-PIVOT 2026-07-16). The geometry tool
// grid that used to live here moved to the FloatingToolbar; this panel is
// "what to compute and how" over whatever geometry the toolbar started: a
// calculation-type picker contextual to the active primitive (lib/viewer/calc
// CALC_TYPES — persisted as the measurement's kind at save), the live readout,
// and — for volume-type calculations — the shared CalcConfig base-surface
// editor whose choices become params.from/params.to SurfaceRefs at save
// (ViewerCanvas.saveMeasurement). Calc state lives in store.view so the save
// path reads the same source of truth this panel edits.

/** Live values computed by the viewer while a tool is active. */
export interface LiveReadout {
  mode: "idle" | "probe" | "polyline" | "polygon";
  vertexCount: number;
  lengthMeters?: number;
  areaSquareMeters?: number;
  perimeterMeters?: number;
  gradePercent?: number;
  point?: LngLatHeight | null;
}

// Back-compat re-export — VOLUME_METHODS moved to lib/viewer/calc.ts.
export { VOLUME_METHODS } from "@/lib/viewer/calc";

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className="caption text-ink-4">{label}</span>
      <span className="num text-ink-1">{value}</span>
    </p>
  );
}

export function MeasurePalette({
  readout,
  onClose,
  onCollapse,
  collapsed = false,
}: {
  readout: LiveReadout;
  onClose: () => void;
  onCollapse?: () => void;
  /** When true, only the title row is shown (panel chrome stays mounted). */
  collapsed?: boolean;
}) {
  const view = useViewerStore((s) => s.view);
  const setView = useViewerStore((s) => s.setView);
  const activeToolKey = useViewerStore((s) => s.activeToolKey);
  const awaitingCalc = readout.mode !== "idle" && readout.mode !== "probe" && !activeToolKey;

  const types = calcTypesFor(readout.mode);
  // The stored pick, reconciled to the current geometry: a stale pick from
  // another primitive falls back to the mode's first (default) calc.
  const selectedType = types.find((t) => t.id === view.calcType) ?? types[0] ?? null;

  const computeLabelId = useId();

  return (
    <div className={`flex flex-col p-3 ${collapsed ? "" : "h-full gap-4"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="h3 min-w-0 truncate text-ink-1">Calculation</h3>
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
      </div>

      {!collapsed && (
        <>
          {/* What to compute — contextual to the geometry the toolbar started. */}
          <div>
            <p id={computeLabelId} className="caps mb-2 text-ink-4">
              What to compute
            </p>
            {types.length === 0 ? (
              <p className="caption text-ink-4">Pick a tool in the toolbar and draw on the site to choose a calculation.</p>
            ) : (
              <>
                <RadioGroup
                  aria-labelledby={computeLabelId}
                  value={selectedType?.id}
                  onValueChange={(calcType) => setView({ calcType })}
                  options={types.map((t) => ({ value: t.id, label: t.label, description: t.hint }))}
                />
                <p className="caption mt-2 text-ink-4">
                  {awaitingCalc
                    ? "Double-click the drawing to calculate, or press Esc to discard."
                    : "Right-click when ready to choose a calculation. Esc discards."}
                </p>
              </>
            )}
          </div>

          <section aria-label="Live readout" className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-2 p-3">
            <p className="caps mb-1 text-ink-4">Live readout</p>
            {readout.mode === "idle" && <p className="caption text-ink-4">Pick a tool, then click the site to start.</p>}

            {readout.mode === "probe" &&
              (readout.point ? (
                <>
                  <ReadoutRow label="Latitude" value={`${readout.point.latitude.toFixed(6)}°`} />
                  <ReadoutRow label="Longitude" value={`${readout.point.longitude.toFixed(6)}°`} />
                  <ReadoutRow label="Elevation" value={`${readout.point.height.toFixed(2)} m`} />
                </>
              ) : (
                <p className="caption text-ink-4">Click the site to sample a point.</p>
              ))}

            {readout.mode === "polyline" && (
              <>
                <ReadoutRow label="Length" value={formatDistance(readout.lengthMeters)} />
                {readout.gradePercent !== undefined && <ReadoutRow label="Grade" value={`${readout.gradePercent.toFixed(1)} %`} />}
                <ReadoutRow label="Vertices" value={String(readout.vertexCount)} />
              </>
            )}

            {readout.mode === "polygon" && (
              <>
                <ReadoutRow label="Area" value={formatArea(readout.areaSquareMeters)} />
                <ReadoutRow label="Perimeter" value={formatDistance(readout.perimeterMeters)} />
                <ReadoutRow label="Vertices" value={String(readout.vertexCount)} />
                <p className="caption pt-1 text-ink-4">Volume: — m³ · computed after save</p>
              </>
            )}
          </section>

          {/* How — the shared base-surface editor, only for volume-type calcs. The
              picked method + inputs become params.from/params.to at save. */}
          {selectedType?.needsBase && (
            <CalcConfig
              idPrefix="palette"
              kind={selectedType.kind}
              value={coerceMethodForKind(
                {
                  method: view.volumeMethod,
                  refMode: view.refMode,
                  refElevation: view.refElevation,
                },
                selectedType.kind
              )}
              onChange={(patch) => {
                const { method, ...rest } = patch;
                setView(method !== undefined ? { ...rest, volumeMethod: method } : rest);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
