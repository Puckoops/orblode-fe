"use client";

import { useViewerStore } from "@/lib/viewer/state/store";
import { visibleTerrain } from "@/components/viewer/shell/sceneHelpers";
import { DETAIL_PANEL_CLEARANCE } from "@/components/viewer/shell/CrossSectionDock";
import { autoRange, bandStep, legendGradient } from "@/lib/viewer/elevationRamp";

/** The elevation colours' key: the ramp bar from the bottom of the range to the top, and the surface it tints. */
export function ElevationLegend() {
  const on = useViewerStore((s) => s.view.elevationColors);
  const ramp = useViewerStore((s) => s.view.elevationRamp);
  const manualRange = useViewerStore((s) => s.view.elevationRange);
  const bands = useViewerStore((s) => s.view.elevationBands);
  const terrain = useViewerStore((s) => visibleTerrain(s.layerControls));
  const datum = useViewerStore((s) => s.manifest?.survey.vertical_datum);
  const detailOpen = useViewerStore((s) => s.detailPanel !== null);
  if (!on || !terrain?.stats) return null;

  const range = manualRange ?? autoRange(terrain.stats);
  const caption = [terrain.label, datum, bands ? `${bandStep(range)} m bands` : null].filter(Boolean).join(" · ");
  return (
    <div
      role="img"
      aria-label={`Elevation colors from ${range.min.toFixed(1)} m to ${range.max.toFixed(1)} m`}
      className="pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 gap-2 rounded-lg border border-hairline bg-surface/90 py-2 pr-3 pl-2 shadow-[var(--shadow-overlay)] backdrop-blur-md"
      style={{ right: detailOpen ? DETAIL_PANEL_CLEARANCE : 12 }}
    >
      <div className="h-40 w-3 rounded-sm" style={{ background: legendGradient(ramp, range, bands) }} />
      <div className="flex flex-col justify-between">
        <span className="num-sm text-ink-1">{range.max.toFixed(1)} m</span>
        <span className="caption max-w-28 text-ink-4">{caption}</span>
        <span className="num-sm text-ink-1">{range.min.toFixed(1)} m</span>
      </div>
    </div>
  );
}
