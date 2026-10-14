"use client";

// The cross-section chart: every surface's height along the line, with a
// readout under the cursor that follows the pin mode, pins that keep a
// readout, and wheel zoom along the chainage with drag to pan. Drawn in
// pixels so text stays crisp at any size.

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@puckoops/camelot";

import {
  chartDomain,
  gradeOf,
  nearestIndex,
  niceTicks,
  tangentGrade,
  tracePath,
  widthAtLevel,
  zExtent,
  type Grade,
  type PinMode,
  type ProfileSeries,
  type Ratio,
} from "@/lib/viewer/profile";
import { convertForDisplay, type UnitSystem } from "@/lib/viewer/units";

export interface ChartSeries extends ProfileSeries {
  label: string;
}

export interface Pin {
  mode: PinMode;
  d: number;
  level: number;
}

const MARGIN = { left: 60, right: 16, top: 14, bottom: 26 };
const FONT = 11;
const CHAR_W = 6.7;
const LABEL_H = 18;

export function gradeText(g: Grade): string {
  return `${g.percent.toFixed(1)}% · ${g.degrees.toFixed(1)}°${g.run === null ? "" : ` · 1:${g.run.toFixed(1)}`}`;
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** A text tag with a backdrop, so it reads over the traces. */
function Tag({ x, y, text, color, anchor = "start" }: { x: number; y: number; text: string; color?: string; anchor?: "start" | "end" | "middle" }) {
  const w = text.length * CHAR_W + 10;
  const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - LABEL_H / 2} width={w} height={LABEL_H} rx={4} fill="var(--surface)" fillOpacity={0.92} stroke={color ?? "var(--hairline-strong)"} strokeWidth={1} />
      <text x={left + 5} y={y + 4} fontSize={FONT} fill="var(--text-1)" className="font-mono tabular-nums">
        {text}
      </text>
    </g>
  );
}

/** Spreads tags that would overlap, keeping each near its own height. */
function spread<T extends { y: number }>(items: T[], top: number, bottom: number): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].y - sorted[k - 1].y < LABEL_H + 2) sorted[k] = { ...sorted[k], y: sorted[k - 1].y + LABEL_H + 2 };
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].y - (bottom - LABEL_H / 2) : 0;
  if (overflow > 0) for (let k = 0; k < sorted.length; k++) sorted[k] = { ...sorted[k], y: Math.max(top + LABEL_H / 2, sorted[k].y - overflow) };
  return sorted;
}

export function ProfileChart({
  distances,
  vertices,
  lengthM,
  spacingM,
  series,
  system,
  mode,
  ratio,
  pins,
  onPin,
  highlight,
  onCursor,
  resetKey,
}: {
  distances: number[];
  vertices: number[];
  lengthM: number;
  spacingM: number;
  series: ChartSeries[];
  system: UnitSystem;
  mode: PinMode;
  ratio: Ratio;
  pins: Pin[];
  onPin: (pin: Pin) => void;
  /** The series the legend is pointing at; the others fade. */
  highlight: string | null;
  /** The station under the cursor, for the marker on the scene. */
  onCursor: (index: number | null) => void;
  /** Changing it shows the whole line again. */
  resetKey: string;
}) {
  const clipId = `profile-clip-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = useSize(boxRef);
  const [cursor, setCursor] = useState<{ d: number; level: number } | null>(null);
  const [win, setWin] = useState<{ d0: number; d1: number } | null>(null);
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setWin(null);
    setCursor(null);
  }

  const unit = convertForDisplay("length_m", 1, system);
  const fmt = useCallback((m: number, digits = 2) => `${(m * unit.value).toFixed(digits)} ${unit.unit}`, [unit.value, unit.unit]);

  const plot = {
    left: MARGIN.left,
    top: MARGIN.top,
    width: Math.max(size.width - MARGIN.left - MARGIN.right, 1),
    height: Math.max(size.height - MARGIN.top - MARGIN.bottom, 1),
  };
  const view = win ?? { d0: 0, d1: lengthM };
  const { d0, d1 } = view;
  const { width: plotW, height: plotH } = plot;
  const dom = useMemo(() => {
    const extent = zExtent(distances, series, d0, d1);
    if (!extent) return null;
    const box = { width: plotW, height: plotH };
    const first = chartDomain({ d0, d1 }, extent, box, ratio);
    if (first.x0 >= d0 && first.x1 <= d1) return first;
    // A ratio can widen the chainage past the window; the heights shown must cover what comes into view.
    return chartDomain({ d0, d1 }, zExtent(distances, series, first.x0, first.x1) ?? extent, box, ratio);
  }, [distances, series, d0, d1, plotW, plotH, ratio]);

  const xOf = useCallback((d: number) => (dom ? plot.left + ((d - dom.x0) / (dom.x1 - dom.x0)) * plot.width : 0), [dom, plot.left, plot.width]);
  const yOf = useCallback((z: number) => (dom ? plot.top + ((dom.y1 - z) / (dom.y1 - dom.y0)) * plot.height : 0), [dom, plot.top, plot.height]);
  const dAt = (px: number) => (dom ? dom.x0 + ((px - plot.left) / plot.width) * (dom.x1 - dom.x0) : 0);
  const zAt = (py: number) => (dom ? dom.y1 - ((py - plot.top) / plot.height) * (dom.y1 - dom.y0) : 0);

  const paths = useMemo(
    () => series.map((s) => ({ key: s.key, color: s.color, primary: s.primary, d: s.z ? tracePath(distances, s.z, xOf, yOf) : "" })),
    [series, distances, xOf, yOf]
  );

  const latest = useRef({ view, lengthM, spacingM, dom, plot });
  useEffect(() => {
    latest.current = { view, lengthM, spacingM, dom, plot };
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, lengthM: len, spacingM: sp, dom: dm, plot: pl } = latest.current;
      if (!dm || len <= 0) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const at = dm.x0 + ((e.clientX - rect.left - pl.left) / pl.width) * (dm.x1 - dm.x0);
      const span = v.d1 - v.d0;
      const next = Math.min(len, Math.max(Math.max(sp * 8, 0.5), span * Math.exp(e.deltaY * 0.0015)));
      if (next >= len) {
        setWin(null);
        return;
      }
      const anchor = Math.min(v.d1, Math.max(v.d0, at));
      let d0 = anchor - ((anchor - v.d0) * next) / span;
      d0 = Math.min(len - next, Math.max(0, d0));
      setWin({ d0, d1: d0 + next });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ x: number; d0: number; d1: number; moved: boolean } | null>(null);

  const pointAt = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  const moveCursor = (d: number, level: number) => {
    const clamped = Math.min(lengthM, Math.max(0, d));
    setCursor({ d: clamped, level });
    onCursor(nearestIndex(distances, clamped));
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dom) return;
    const { px, py } = pointAt(e);
    const g = drag.current;
    if (g && e.buttons === 1) {
      const dx = px - g.x;
      if (Math.abs(dx) > 3) g.moved = true;
      if (g.moved && win) {
        const span = g.d1 - g.d0;
        const shift = (-dx / plot.width) * (dom.x1 - dom.x0);
        const d0 = Math.min(lengthM - span, Math.max(0, g.d0 + shift));
        setWin({ d0, d1: d0 + span });
        return;
      }
    }
    moveCursor(dAt(px), zAt(py));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !dom) return;
    const { px, py } = pointAt(e);
    moveCursor(dAt(px), zAt(py));
    drag.current = { x: px, d0: view.d0, d1: view.d1, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g || g.moved || !cursor) return;
    onPin({ mode, d: distances[nearestIndex(distances, cursor.d)] ?? cursor.d, level: cursor.level });
  };

  const onLeave = () => {
    if (drag.current) return;
    setCursor(null);
    onCursor(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!distances.length || !dom) return;
    const i = cursor ? nearestIndex(distances, cursor.d) : 0;
    const level = cursor?.level ?? (dom.y0 + dom.y1) / 2;
    const step = e.shiftKey ? 10 : 1;
    if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Enter", " ", "Escape"].includes(e.key)) e.stopPropagation();
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = Math.min(distances.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? step : -step)));
      moveCursor(distances[j], level);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(cursor?.d ?? distances[0], level + ((e.key === "ArrowUp" ? 1 : -1) * (dom.y1 - dom.y0)) / 50);
    } else if ((e.key === "Enter" || e.key === " ") && cursor) {
      e.preventDefault();
      onPin({ mode, d: distances[i], level });
    } else if (e.key === "Escape") {
      setCursor(null);
      onCursor(null);
    }
  };

  const primary = series.find((s) => s.primary && s.z) ?? series.find((s) => s.z) ?? null;
  const halfWindow = Math.max(2 * spacingM, 1);

  /** The tags and marks of one readout: under the cursor, or kept by a pin. */
  const readout = (m: PinMode, d: number, level: number, pinned: boolean, key: string) => {
    if (!dom) return null;
    const i = nearestIndex(distances, d);
    if (i < 0) return null;
    const x = xOf(distances[i]);
    const ink = pinned ? "var(--text-2)" : "var(--text-3)";
    const tagsLeft = x > plot.left + plot.width * 0.7;

    if (m === "horizontal") {
      const w = primary?.z ? widthAtLevel(distances, primary.z, d, level) : null;
      const y = yOf(level);
      if (y < plot.top || y > plot.top + plot.height) return null;
      return (
        <g key={key}>
          <line x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} stroke={ink} strokeDasharray="3 4" strokeWidth={1} />
          {w && (
            <>
              <line x1={xOf(w.from)} x2={xOf(w.to)} y1={y} y2={y} stroke={primary!.color} strokeWidth={2} />
              <line x1={xOf(w.from)} x2={xOf(w.from)} y1={y - 5} y2={y + 5} stroke={primary!.color} strokeWidth={2} />
              <line x1={xOf(w.to)} x2={xOf(w.to)} y1={y - 5} y2={y + 5} stroke={primary!.color} strokeWidth={2} />
              <Tag x={(xOf(w.from) + xOf(w.to)) / 2} y={y - LABEL_H} anchor="middle" text={`${fmt(w.to - w.from)} wide`} color={primary!.color} />
            </>
          )}
          <Tag x={plot.left + 4} y={y + LABEL_H} text={`at ${fmt(level)}`} />
        </g>
      );
    }

    const marks: { key: string; y: number; color: string; text: string; dot: number }[] = [];
    const base = primary?.z?.[i] ?? null;
    for (const s of series) {
      const z = s.z?.[i];
      if (z === null || z === undefined || (highlight && highlight !== s.key)) continue;
      const dotY = yOf(z);
      if (m === "grade") {
        if (!s.primary && highlight !== s.key) continue;
        const g = tangentGrade(distances, s.z!, i, halfWindow);
        if (g) marks.push({ key: s.key, y: dotY, color: s.color, text: gradeText(g), dot: dotY });
        continue;
      }
      const delta = !s.primary && base !== null ? ` (${z - base >= 0 ? "+" : "−"}${(Math.abs(z - base) * unit.value).toFixed(2)})` : "";
      marks.push({ key: s.key, y: dotY, color: s.color, text: `${fmt(z)}${delta}`, dot: dotY });
    }
    const placed = spread(marks, plot.top, plot.top + plot.height);
    return (
      <g key={key}>
        <line x1={x} x2={x} y1={plot.top} y2={plot.top + plot.height} stroke={ink} strokeWidth={1} strokeDasharray={pinned ? undefined : "3 4"} />
        {marks.map((mk) => (
          <circle key={`dot-${mk.key}`} cx={x} cy={mk.dot} r={4} fill={mk.color} stroke="var(--surface)" strokeWidth={1.5} />
        ))}
        {placed.map((mk) => (
          <Tag key={`tag-${mk.key}`} x={tagsLeft ? x - 10 : x + 10} y={mk.y} anchor={tagsLeft ? "end" : "start"} text={mk.text} color={mk.color} />
        ))}
        <Tag x={x} y={plot.top + plot.height + 13} anchor="middle" text={fmt(distances[i])} />
      </g>
    );
  };

  /** Between two grade pins in a row, the chord and its average grade. */
  const chords = () => {
    const ordered = pins.filter((p) => p.mode === "grade").sort((a, b) => a.d - b.d);
    const z = primary?.z;
    if (!z || ordered.length < 2) return null;
    return ordered.slice(1).map((p, k) => {
      const a = nearestIndex(distances, ordered[k].d);
      const b = nearestIndex(distances, p.d);
      const za = z[a];
      const zb = z[b];
      if (za === null || zb === null || b <= a) return null;
      const run = distances[b] - distances[a];
      const g = gradeOf(zb - za, run);
      if (!g) return null;
      const x1 = xOf(distances[a]);
      const x2 = xOf(distances[b]);
      return (
        <g key={`chord-${a}-${b}`}>
          <line x1={x1} x2={x2} y1={yOf(za)} y2={yOf(zb)} stroke={primary!.color} strokeWidth={1.5} strokeDasharray="6 3" />
          <Tag x={(x1 + x2) / 2} y={(yOf(za) + yOf(zb)) / 2 - LABEL_H} anchor="middle" text={`${gradeText(g)} over ${fmt(run, 1)}`} color={primary!.color} />
        </g>
      );
    });
  };

  const xTicks = dom ? niceTicks(dom.x0 * unit.value, dom.x1 * unit.value, Math.max(2, Math.floor(plot.width / 90))) : null;
  const yTicks = dom ? niceTicks(dom.y0 * unit.value, dom.y1 * unit.value, Math.max(2, Math.floor(plot.height / 40))) : null;
  const decimals = (step: number) => Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9)));


  return (
    <div ref={boxRef} className="relative min-h-0 flex-1">
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        tabIndex={0}
        role="img"
        aria-label={`Cross-section over ${fmt(lengthM, 1)}: ${series.map((s) => s.label).join(", ")}. Arrow keys move along the line, Enter pins a reading, the wheel zooms.`}
        className="absolute inset-0 cursor-crosshair touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onLeave}
        onKeyDown={onKeyDown}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={plot.left} y={plot.top} width={plot.width} height={plot.height} />
          </clipPath>
        </defs>
        {dom && xTicks && yTicks && (
          <>
            {yTicks.values.map((v) => {
              const y = yOf(v / unit.value);
              return (
                <g key={`y${v}`}>
                  <line x1={plot.left} x2={plot.left + plot.width} y1={y} y2={y} stroke="var(--hairline)" strokeWidth={1} />
                  {y > plot.top + 6 && y < plot.top + plot.height - 6 && (
                    <text x={plot.left - 6} y={y + 4} textAnchor="end" fontSize={FONT} fill="var(--text-3)" className="font-mono tabular-nums">
                      {v.toFixed(decimals(yTicks.step))}
                    </text>
                  )}
                </g>
              );
            })}
            {xTicks.values.map((v) => {
              const x = xOf(v / unit.value);
              return (
                <g key={`x${v}`}>
                  <line x1={x} x2={x} y1={plot.top} y2={plot.top + plot.height} stroke="var(--hairline)" strokeWidth={1} />
                  <text x={x} y={plot.top + plot.height + 16} textAnchor="middle" fontSize={FONT} fill="var(--text-3)" className="font-mono tabular-nums">
                    {v.toFixed(decimals(xTicks.step))}
                  </text>
                </g>
              );
            })}
            <text x={plot.left - 6} y={plot.top - 3} textAnchor="end" fontSize={FONT - 1} fill="var(--text-4)">
              {unit.unit}
            </text>
            <g clipPath={`url(#${clipId})`}>
              {[0, lengthM].map((d) => (
                <line key={`end${d}`} x1={xOf(d)} x2={xOf(d)} y1={plot.top} y2={plot.top + plot.height} stroke="var(--hairline-strong)" strokeWidth={1} />
              ))}
              {vertices.slice(1, -1).map((d) => (
                <line key={`v${d}`} x1={xOf(d)} x2={xOf(d)} y1={plot.top} y2={plot.top + plot.height} stroke="var(--hairline-strong)" strokeWidth={1} strokeDasharray="2 3" />
              ))}
              {[...paths]
                .sort((a, b) => Number(a.key === highlight) - Number(b.key === highlight) || Number(a.primary) - Number(b.primary))
                .map((p) => (
                  <path
                    key={p.key}
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.key === highlight ? 3 : p.primary ? 2.25 : 1.75}
                    strokeOpacity={highlight && highlight !== p.key ? 0.25 : 1}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              {chords()}
            </g>
            {pins.map((p, k) => readout(p.mode, p.d, p.level, true, `pin-${k}`))}
            {cursor && readout(mode, cursor.d, cursor.level, false, "cursor")}
          </>
        )}
      </svg>
      {win && (
        <Button size="sm" variant="quiet" className="absolute top-0 right-4" onClick={() => setWin(null)}>
          Whole line
        </Button>
      )}
      {!dom && size.width > 0 && (
        <p className="caption absolute inset-0 flex items-center justify-center px-6 text-center text-ink-4">
          No surface along this line to draw.
        </p>
      )}
    </div>
  );
}
