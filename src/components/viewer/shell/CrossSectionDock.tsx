"use client";

// The cross-section dock, docked over the bottom of the canvas while a line
// measurement with its cross-section on is selected (Propeller's chart under
// the map). It asks orblode-svc for the profile whenever the line or the
// surfaces it is compared with change, keeps the last chart up while the next
// one loads, and lays a marker on the scene where the chart's cursor is.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cancel01Icon, Download04Icon, SplineIcon } from "@hugeicons/core-free-icons";
import { Button, HelperText, Icon, IconButton, Menu, MenuItem, ProgressCircle, Select } from "@puckoops/camelot";

import { getProfile, type Measurement, type ProfileResponse } from "@/lib/api/orblodeSvc";
import { stripErrNamespace } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import {
  buildSeries,
  profileCsv,
  profileDxf,
  profileSurfaces,
  refKey,
  type CompareRef,
  type PinMode,
  type Ratio,
} from "@/lib/viewer/profile";
import { getWorkingTransform } from "@/lib/viewer/projection";
import { styleOf } from "@/lib/viewer/style";
import { convertForDisplay, unitSystemOf } from "@/lib/viewer/units";
import { useViewerStore } from "@/lib/viewer/state/store";
import { useCrossSectionSettings, useSurfaceNames } from "@/components/viewer/shell/hooks/useCrossSection";
import { useProfileMarker } from "@/components/viewer/shell/hooks/useProfileMarker";
import { ProfileChart, type ChartSeries, type Pin } from "@/components/viewer/shell/ProfileChart";

const HEIGHT_KEY = "orblode.crossSectionHeight";
const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 200;
export const DETAIL_PANEL_CLEARANCE = 320 + 24;

const PIN_MODES: { value: PinMode; label: string }[] = [
  { value: "elevation", label: "Elevation" },
  { value: "horizontal", label: "Horizontal" },
  { value: "grade", label: "Grade" },
];

const RATIOS: { value: string; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: "1", label: "1:1" },
  { value: "2", label: "1:2" },
  { value: "4", label: "1:4" },
  { value: "8", label: "1:8" },
];

function readHeight(): number {
  try {
    const v = Number(localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(v) && v >= MIN_HEIGHT ? v : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fileStem(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "cross-section";
}

function lineCoords(m: Measurement): number[][] | null {
  const coords = m.geometry?.type === "LineString" ? (m.geometry.coordinates as unknown) : null;
  if (!Array.isArray(coords)) return null;
  const out = coords.filter((c): c is number[] => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]]);
  return out.length >= 2 ? out : null;
}

export function CrossSectionDock() {
  const measurement = useViewerStore((s) => {
    if (s.selection?.kind !== "measurement" || s.drawMode) return null;
    const id = s.selection.measurementIds[0];
    const m = s.measurements.find((x) => x.id === id);
    return m && m.geometry?.type === "LineString" ? m : null;
  });
  const { settings } = useCrossSectionSettings(measurement);
  if (!measurement || !settings?.show) return null;
  return <Dock key={measurement.id} measurement={measurement} />;
}

function Dock({ measurement }: { measurement: Measurement }) {
  const surveyId = useViewerStore((s) => s.surveyId);
  const detailOpen = useViewerStore((s) => s.detailPanel !== null);
  const workingCrs = useViewerStore((s) => s.manifest?.survey.working_crs ?? null);
  const { settings, save } = useCrossSectionSettings(measurement);
  const compare = useMemo(() => settings?.compare ?? [], [settings]);

  const system = unitSystemOf(measurement.params);
  const elevation = useCallback(
    (m: number) => {
      const c = convertForDisplay("length_m", m, system);
      return `${c.value.toFixed(2)} ${c.unit}`;
    },
    [system]
  );
  const names = useSurfaceNames(elevation);
  const primaryColor = styleOf(measurement.params).stroke;

  const coords = useMemo(() => lineCoords(measurement), [measurement]);
  const surfaces = useMemo(() => profileSurfaces(compare), [compare]);
  const reqKey = coords ? JSON.stringify([coords, surfaces]) : "";

  const [result, setResult] = useState<{ key: string; data: ProfileResponse; compare: CompareRef[] } | null>(null);
  const [status, setStatus] = useState<{ key: string; loading: boolean; error: string | null }>({ key: "", loading: false, error: null });
  const compareRef = useRef(compare);
  useEffect(() => {
    compareRef.current = compare;
  }, [compare]);

  useEffect(() => {
    if (!reqKey) return;
    const [line, asked] = JSON.parse(reqKey) as [number[][], ReturnType<typeof profileSurfaces>];
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus({ key: reqKey, loading: true, error: null });
      try {
        const data = await getProfile(
          surveyId,
          { line: { type: "LineString", coordinates: line }, surfaces: asked },
          AbortSignal.any([ctl.signal, AbortSignal.timeout(45_000)])
        );
        setResult({ key: reqKey, data, compare: compareRef.current });
        setStatus({ key: reqKey, loading: false, error: null });
      } catch (err) {
        if (ctl.signal.aborted) return;
        setStatus({ key: reqKey, loading: false, error: err instanceof Error ? stripErrNamespace(err.message) : "The cross-section could not be drawn." });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [reqKey, surveyId]);

  const current = result?.key === reqKey;
  const series: ChartSeries[] = useMemo(() => {
    if (!result) return [];
    const shownCompare = current ? compare : result.compare;
    const byKey = new Map(shownCompare.map((c) => [refKey(c), c]));
    return buildSeries(result.data, shownCompare, primaryColor).map((s) => ({
      ...s,
      label: s.primary ? names.primary : names.of(byKey.get(s.key)!),
    }));
  }, [result, current, compare, primaryColor, names]);

  const [mode, setMode] = useState<PinMode>("elevation");
  const [ratio, setRatio] = useState<Ratio>("fit");
  const [pins, setPins] = useState<Pin[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);
  const [height, setHeight] = useState(readHeight);

  const data = result?.data ?? null;
  useProfileMarker(data && cursorIndex !== null && cursorIndex >= 0 ? { lon: data.lon[cursorIndex], lat: data.lat[cursorIndex] } : null);

  const shellRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ y: number; h: number } | null>(null);
  const onResizeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    resizing.current = { y: e.clientY, h: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = resizing.current;
    const host = shellRef.current?.parentElement;
    if (!r || !host) return;
    const max = Math.max(MIN_HEIGHT, host.clientHeight * 0.75);
    setHeight(Math.round(Math.min(max, Math.max(MIN_HEIGHT, r.h + r.y - e.clientY))));
  };
  const onResizeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    resizing.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      // A blocked store only loses the remembered height.
    }
  };

  const exportSeries = () => series.map((s) => ({ label: s.label, z: s.z }));
  const stem = fileStem(measurement.name);
  const exportCsv = () => data && download(`${stem}.csv`, profileCsv(data, exportSeries()), "text/csv");
  const exportSection = () => data && download(`${stem}-section.dxf`, profileDxf(data.distance_m, exportSeries()), "application/dxf");
  const export3d = async () => {
    if (!data) return;
    const transform = await getWorkingTransform(workingCrs).catch(() => null);
    if (!transform) {
      toast.error("The survey's coordinate system could not be resolved for a 3D export.");
      return;
    }
    const east: number[] = [];
    const north: number[] = [];
    for (let i = 0; i < data.lon.length; i++) {
      const [e, n] = transform.forward([data.lon[i], data.lat[i]]);
      east.push(e);
      north.push(n);
    }
    download(`${stem}-3d.dxf`, profileDxf(data.distance_m, exportSeries(), { east, north }), "application/dxf");
  };

  const loading = status.key === reqKey && status.loading;
  const error = status.key === reqKey ? status.error : null;

  return (
    <div
      ref={shellRef}
      className="pointer-events-auto absolute bottom-3 left-3 z-10 flex flex-col rounded-lg border border-hairline bg-surface/95 shadow-[var(--shadow-overlay)] backdrop-blur-md"
      style={{ height, right: detailOpen ? DETAIL_PANEL_CLEARANCE : 12 }}
      aria-label="Cross section"
      role="region"
    >
      <button
        type="button"
        aria-label="Drag to resize the cross section"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        className="absolute -top-1.5 left-1/2 h-3 w-16 -translate-x-1/2 cursor-ns-resize touch-none rounded-full"
      >
        <span className="mx-auto block h-1.5 w-10 rounded-full bg-hairline-strong" />
      </button>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 pt-2.5 pb-1.5">
        <Icon icon={SplineIcon} size={16} className="text-ink-3" />
        <h3 className="caps shrink-0 text-ink-3">Cross section</h3>
        <span className="caption min-w-0 flex-1 truncate text-ink-2">{measurement.name}</span>
        {loading && <ProgressCircle value={null} size="sm" aria-label="Drawing the cross section" />}
        <Select variant="filter" aria-label="Pin values" value={mode} onValueChange={(v) => setMode(v as PinMode)} options={PIN_MODES} />
        {pins.length > 0 && (
          <Button size="sm" variant="quiet" iconStart={Cancel01Icon} onClick={() => setPins([])}>
            Clear pins
          </Button>
        )}
        <Select
          variant="filter"
          aria-label="Aspect ratio"
          value={String(ratio)}
          onValueChange={(v) => setRatio(v === "fit" ? "fit" : (Number(v) as Ratio))}
          options={RATIOS}
        />
        <Menu align="end" minWidth={240} trigger={<IconButton icon={Download04Icon} aria-label="Export the cross section" size="sm" variant="bare" disabled={!data} />}>
          <MenuItem onSelect={exportCsv}>CSV · chainage, position, heights</MenuItem>
          <MenuItem onSelect={exportSection}>DXF · section (chainage × height)</MenuItem>
          <MenuItem onSelect={() => void export3d()} disabled={!workingCrs}>
            DXF · 3D in the survey&apos;s coordinates
          </MenuItem>
        </Menu>
        <IconButton icon={Cancel01Icon} aria-label="Hide the cross section" size="sm" variant="bare" onClick={() => settings && void save({ ...settings, show: false })} />
      </div>

      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 px-3 pb-1" aria-label="Surfaces">
        {series.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onPointerEnter={() => setHighlight(s.key)}
              onPointerLeave={() => setHighlight(null)}
              onFocus={() => setHighlight(s.key)}
              onBlur={() => setHighlight(null)}
              className={`caption flex items-center gap-1.5 rounded-xs px-1 py-0.5 ${highlight === s.key ? "bg-surface-3 text-ink-1" : "text-ink-2"}`}
              title={s.error}
            >
              <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color, opacity: s.z ? 1 : 0.35 }} />
              <span className={s.z ? "" : "text-ink-4 line-through"}>{s.label}</span>
              {s.error && <span className="text-ink-4">· {s.error}</span>}
            </button>
          </li>
        ))}
      </ul>

      {error && !data ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <HelperText tone="error">{error}</HelperText>
        </div>
      ) : data ? (
        <ProfileChart
          distances={data.distance_m}
          vertices={data.vertices_m}
          lengthM={data.length_m}
          spacingM={data.spacing_m}
          series={series}
          system={system}
          mode={mode}
          ratio={ratio}
          pins={pins}
          onPin={(p) =>
            setPins((cur) =>
              cur.some((q) => q.mode === p.mode && q.d === p.d && (p.mode !== "horizontal" || Math.abs(q.level - p.level) < 1e-6)) ? cur : [...cur, p]
            )
          }
          highlight={highlight}
          onCursor={setCursorIndex}
          resetKey={`${measurement.id}:${data.length_m}`}
        />
      ) : (
        <div className="flex-1" />
      )}
      {error && data && <p className="caption px-3 pb-2 text-ink-4">{error}</p>}
    </div>
  );
}
