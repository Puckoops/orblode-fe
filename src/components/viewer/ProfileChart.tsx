"use client";

// Cross-section profile chart (FR-09) — the 2D elevation graph for a
// `cross_section` measurement, rendered inside the FeatureInspector beneath the
// metrics grid.
//
// Presentational only: it takes an already-parsed ProfileSeries (lib/viewer/
// profile.ts owns every calculation and is unit-tested without React) and draws
// it as inline SVG. No chart library — the trace is two path strings, which
// keeps the bundle flat and lets nodata gaps break the line exactly where the
// DSM has holes.
//
// HOVER IS BIDIRECTIONAL (FR-09's acceptance criterion):
//   chart → 3D   pointer moves over the plot → `onHoverStation(sample)`; the
//                canvas drops a marker at that station's world position.
//   3D → chart   the canvas resolves its cursor to a station index and passes
//                it as `externalIndex`; the crosshair + readout move here.
// The pointer-over-chart case always WINS: while the user is physically moving
// over the graph, a stale external index must not fight their cursor. That is
// the whole reason `hoverIndex` prefers local state and only falls back to
// `externalIndex` when the pointer has left.

import React, { useCallback, useMemo, useRef, useState } from "react";

import {
  axisTicks,
  buildAreaPath,
  buildScales,
  buildTracePath,
  nearestSample,
  overallGradePercent,
  type ChartBox,
  type ProfileSample,
  type ProfileSeries,
} from "@/lib/viewer/profile";
import { convertForDisplay, type UnitSystem } from "@/lib/viewer/units";

// The SVG coordinate system. The element scales to its container via viewBox +
// `w-full`, so these are layout units, not pixels — the left pad fits a 5-char
// elevation label in Camelot's tick face (.num-sm), the bottom pad one row of
// chainage labels.
const BOX: ChartBox = {
  width: 320,
  height: 152,
  padLeft: 42,
  padRight: 8,
  padTop: 10,
  padBottom: 22,
};

/** Camelot's chart paints: one ink series on hairline axes, quiet mono ticks. */
const SERIES = "var(--series-1)";
const HOVER = "var(--text-1)";
const GRID = "var(--hairline)";
const AXIS = "var(--hairline-strong)";
const AXIS_TEXT = "var(--text-4)";

function fmtLength(meters: number, system: UnitSystem): string {
  const c = convertForDisplay("length_m", meters, system);
  return `${c.value.toLocaleString(undefined, { maximumFractionDigits: c.value < 100 ? 1 : 0 })} ${c.unit}`;
}

/** Elevation gets 2 dp — this is the survey-grade number the panel exists to
 * show, and rounding it to whole metres would hide the very detail a
 * cross-section is drawn to inspect. */
function fmtElevation(meters: number, system: UnitSystem): string {
  const c = convertForDisplay("length_m", meters, system);
  return `${c.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c.unit}`;
}

/** Axis labels are dense, so they drop to whole units (and km/kft past 1000)
 * rather than repeating a long decimal five times across the axis. */
function fmtAxis(meters: number, system: UnitSystem): string {
  const c = convertForDisplay("length_m", meters, system);
  const abs = Math.abs(c.value);
  if (abs >= 1000) {
    return `${(c.value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  }
  return c.value.toLocaleString(undefined, {
    maximumFractionDigits: abs < 10 ? 1 : 0,
  });
}

export interface ProfileChartProps {
  series: ProfileSeries;
  system?: UnitSystem;
  /** Station index highlighted from the 3D canvas. Yields to the local pointer
   * whenever it is over the plot. */
  externalIndex?: number | null;
  /** Fired on every pointer move over the plot (and null on leave) so the 3D
   * canvas can mirror the crosshair as a world-space marker. */
  onHoverStation?: (sample: ProfileSample | null) => void;
}

export function ProfileChart({
  series,
  system = "metric",
  externalIndex = null,
  onHoverStation,
}: ProfileChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [localIndex, setLocalIndex] = useState<number | null>(null);
  const [pointerInside, setPointerInside] = useState(false);

  const scales = useMemo(() => buildScales(series, BOX), [series]);
  const tracePath = useMemo(() => buildTracePath(series, scales), [series, scales]);
  const areaPath = useMemo(() => buildAreaPath(series, scales), [series, scales]);

  const xTicks = useMemo(
    () => axisTicks(0, series.lengthM, 4),
    [series.lengthM]
  );
  const yTicks = useMemo(
    () => axisTicks(scales.domain.lo, scales.domain.hi, 3),
    [scales.domain.lo, scales.domain.hi]
  );

  const grade = useMemo(() => overallGradePercent(series), [series]);

  // The pointer wins while it is over the plot; otherwise the 3D canvas drives.
  const hoverIndex = pointerInside ? localIndex : externalIndex;
  const hovered =
    hoverIndex !== null && hoverIndex >= 0 && hoverIndex < series.samples.length
      ? series.samples[hoverIndex]
      : null;

  /** Pointer position → chainage → nearest station. The SVG is scaled by CSS,
   * so client pixels must be mapped back through the rendered rect into the
   * viewBox's own coordinate space before `distanceAt` means anything. */
  const handleMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0) return;
      const svgX = ((e.clientX - rect.left) / rect.width) * BOX.width;
      const hit = nearestSample(series, scales.distanceAt(svgX));
      if (!hit) return;
      setLocalIndex(hit.index);
      onHoverStation?.(hit.sample);
    },
    [series, scales, onHoverStation]
  );

  const handleLeave = useCallback(() => {
    setPointerInside(false);
    setLocalIndex(null);
    onHoverStation?.(null);
  }, [onHoverStation]);

  // Every station is nodata — there is no trace to draw, and an axis over an
  // invented 0..1 domain would read as real ground.
  if (series.minZ === null || series.maxZ === null) {
    return (
      <div className="rounded-md border border-hairline bg-surface p-3">
        <p className="caption text-ink-4">No elevation data along this line — the surface has no coverage here.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-hairline bg-surface p-2.5">
      {/* Header: the readout tracks the hover, falling back to the profile's
          own summary so the row never goes blank as the pointer leaves. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="caps text-ink-4">Cross-section</span>
        <span className="num-sm text-ink-2">
          {hovered && hovered.z !== null ? (
            <>
              <span className="text-ink-4">ch</span> {fmtLength(hovered.distanceM, system)}
              <span className="mx-1 text-ink-4">·</span>
              <span className="text-ink-4">z</span>{" "}
              <span className="text-ink-1">{fmtElevation(hovered.z, system)}</span>
            </>
          ) : (
            <>
              {fmtLength(series.lengthM, system)}
              {grade !== null && (
                <>
                  <span className="mx-1 text-ink-4">·</span>
                  <span className="text-ink-4">grade</span> {grade.toFixed(1)}%
                </>
              )}
            </>
          )}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Elevation profile over ${fmtLength(series.lengthM, system)}, ${series.samples.length} stations`}
        onPointerEnter={() => setPointerInside(true)}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        {/* Horizontal grid + elevation labels. */}
        {yTicks.map((z) => {
          const y = scales.yOf(z);
          return (
            <g key={`y${z}`}>
              <line
                x1={scales.plotLeft}
                x2={scales.plotRight}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeWidth={1}
              />
              <text x={scales.plotLeft - 5} y={y} dy="0.32em" textAnchor="end" fill={AXIS_TEXT} className="num-sm">
                {fmtAxis(z, system)}
              </text>
            </g>
          );
        })}

        {/* Chainage labels along the baseline. */}
        {xTicks.map((d) => (
          <text key={`x${d}`} x={scales.xOf(d)} y={BOX.height - 6} textAnchor="middle" fill={AXIS_TEXT} className="num-sm">
            {fmtAxis(d, system)}
          </text>
        ))}

        {/* Plot frame — only the two axes the eye needs, not a full box. */}
        <line
          x1={scales.plotLeft}
          x2={scales.plotLeft}
          y1={scales.plotTop}
          y2={scales.plotBottom}
          stroke={AXIS}
          strokeWidth={1}
        />
        <line
          x1={scales.plotLeft}
          x2={scales.plotRight}
          y1={scales.plotBottom}
          y2={scales.plotBottom}
          stroke={AXIS}
          strokeWidth={1}
        />

        <path d={areaPath} fill={SERIES} fillOpacity={0.14} />
        <path
          d={tracePath}
          fill="none"
          stroke={SERIES}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover crosshair + station dot. */}
        {hovered && hovered.z !== null && (
          <g pointerEvents="none">
            <line
              x1={scales.xOf(hovered.distanceM)}
              x2={scales.xOf(hovered.distanceM)}
              y1={scales.plotTop}
              y2={scales.plotBottom}
              stroke={HOVER}
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle
              cx={scales.xOf(hovered.distanceM)}
              cy={scales.yOf(hovered.z)}
              r={3}
              fill={HOVER}
              stroke="var(--surface)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
