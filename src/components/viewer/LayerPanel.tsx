"use client";

import React, { useState } from "react";
import {
  AnalyticsUpIcon,
  ArrowRight01Icon,
  Building03Icon,
  CubeIcon,
  DistributionIcon,
  Image01Icon,
  MapsIcon,
  MountainIcon,
  PenTool02Icon,
  RippleIcon,
  Settings01Icon,
  SparklesIcon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { Alert, Button, Field, Glyph, Icon, IconButton, Input, ProgressCircle, Select, Slider, Switch, Tooltip, type IconDefinition } from "@puckoops/camelot";
import { Collapsible } from "radix-ui";
import { toast } from "@/lib/toast";
import type { TerrainStats } from "@/lib/api/orblodeSvc";
import type { ViewSettings } from "@/lib/viewer/state/store";
import {
  AUTO_RANGE_CLIP,
  ELEVATION_RAMPS,
  autoRange,
  cssColorAt,
  histogramBars,
  isElevationRampId,
  type ElevationRampId,
  type ElevationRange,
} from "@/lib/viewer/elevationRamp";

export type LayerCategory = "terrain" | "ortho" | "pointcloud" | "lens" | "vector";

export interface LayerControl {
  key: string;
  label: string;
  category: LayerCategory;
  visible: boolean;
  opacity: number; // 0..1
  supportsOpacity: boolean;
  loading?: boolean; // async tileset/vector fetch in flight
  error?: string | null; // last load failure for this layer
  /** Real elevation stats from the manifest (terrain layers only). */
  stats?: TerrainStats;
  /** [west, south, east, north] in degrees (terrain layers only). */
  bbox?: number[];
  /** Contour spacing in meters (vector layers only). */
  intervalM?: number;
  /** Manifest vector role (contours, overlay, …). */
  vectorRole?: string;
}

/** A CAD/vector design overlay (DXF, LandXML, …) from the manifest. */
export interface DesignControl {
  key: string;
  label: string;
  visible: boolean;
  renderable: boolean; // false → no geometry to draw yet (e.g. raw DXF not tiled)
}

export const BASE_MAPS = [
  { id: "dark", label: "Dark" },
  { id: "satellite", label: "Satellite" },
  { id: "streets", label: "Streets" },
] as const;

export type ElevationSettings = Pick<
  ViewSettings,
  "elevationColors" | "elevationRamp" | "elevationRange" | "elevationOpacity" | "elevationBands" | "shading"
>;

export interface ElevationHandlers {
  onColorMapChange: (ramp: ElevationRampId | null) => void;
  onShadingChange: (value: ViewSettings["shading"]) => void;
  onElevationChange: (patch: Partial<Pick<ViewSettings, "elevationRange" | "elevationOpacity" | "elevationBands">>) => void;
}

interface LayerPanelProps extends ElevationHandlers {
  layers: LayerControl[];
  designs: DesignControl[];
  processing: boolean;
  surveyStatus?: string;
  terrainExaggeration: number;
  /** 2D draws the site flat, so there is no relief to exaggerate. */
  exaggerationDisabled?: boolean;
  baseMap: string;
  elevation: ElevationSettings;
  contourIntervalM: number | null;
  availableContourIntervals: number[];
  digitalTwinEnabled?: boolean;
  digitalTwinAvailable?: boolean;
  showDigitalTwin?: boolean;
  sunLightingEnabled?: boolean;
  sunHour?: number;
  onToggle: (key: string) => void;
  onOpacity: (key: string, opacity: number) => void;
  onToggleDesign: (key: string) => void;
  onTerrainExaggeration: (value: number) => void;
  onSetBaseMap: (value: string) => void;
  onContourIntervalChange: (intervalM: number) => void;
  onToggleDigitalTwin?: () => void;
  onSunLightingChange?: (enabled: boolean, hour: number) => void;
}

/** Collapsible section with a caps, caret-prefixed header. */
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="flex w-full items-center gap-1.5 px-2 pt-4 pb-1.5 text-left">
        <Icon icon={ArrowRight01Icon} size={16} className={`shrink-0 text-ink-4 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="caps text-ink-2">{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-1">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

/** A layer that failed to load: its glyph in ink, with the reason on hover. */
function LoadError({ error }: { error: string }) {
  return (
    <Tooltip content={error}>
      <span className="flex shrink-0 text-ink-2" tabIndex={0} aria-label={`Failed to load: ${error}`}>
        <Glyph shape="triangle" />
      </span>
    </Tooltip>
  );
}

/** Icon + label (+ optional count) + a right-side control (Switch by default). */
function ControlRow({
  icon,
  label,
  count,
  active,
  disabled,
  loading,
  error,
  right,
  onToggle,
  onDisabledClick,
}: {
  icon: IconDefinition;
  label: string;
  count?: string;
  active: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  right?: React.ReactNode;
  onToggle?: () => void;
  // Fired when the row is clicked while disabled — a disabled Switch swallows
  // its own onCheckedChange, so without this the "why is this off?" hint (e.g.
  // "not available for this survey") could never reach the user.
  onDisabledClick?: () => void;
}) {
  const rowDisabledClick = disabled && onDisabledClick ? onDisabledClick : undefined;
  return (
    <div
      className={`flex h-9 items-center gap-2.5 px-2 ${rowDisabledClick ? "cursor-pointer" : ""}`}
      onClick={rowDisabledClick}
      role={rowDisabledClick ? "button" : undefined}
    >
      <Icon icon={icon} size={16} className={`shrink-0 ${active ? "text-ink-1" : "text-ink-4"}`} />
      <span className={`small min-w-0 flex-1 truncate ${active ? "font-medium text-ink-1" : "text-ink-2"}`}>
        {label}
        {count && <span className="num-sm ml-1.5 text-ink-4">{count}</span>}
      </span>
      {loading && <ProgressCircle value={null} size="sm" aria-label={`Loading ${label}`} />}
      {!loading && error && <LoadError error={error} />}
      {right ?? <Switch size="sm" aria-label={label} checked={active} disabled={disabled} onCheckedChange={onToggle} />}
    </div>
  );
}

/** Sun-position settings: a time-of-day slider toggling Cesium globe lighting. */
function SunPositionRow({ enabled, hour, onChange }: { enabled: boolean; hour: number; onChange: (enabled: boolean, hour: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex h-9 items-center gap-2.5 px-2">
        <Icon icon={Sun03Icon} size={16} className={`shrink-0 ${enabled ? "text-ink-1" : "text-ink-4"}`} />
        <span className="small min-w-0 flex-1 text-ink-2">Sun position</span>
        <IconButton
          icon={Settings01Icon}
          aria-label="Sun position settings"
          aria-expanded={open}
          variant="bare"
          size="sm"
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open && (
        <div className="mx-2 mb-2 flex flex-col gap-3 rounded-md border border-hairline bg-surface-2 p-3">
          <Switch label="Lighting" labelPosition="start" size="sm" checked={enabled} onCheckedChange={(v) => onChange(v, hour)} />
          <Slider
            label="Time of day"
            value={[hour]}
            min={0}
            max={23}
            step={1}
            disabled={!enabled}
            format={(v) => `${Math.round(v)}:00`}
            onValueChange={([v]) => onChange(enabled, v)}
          />
        </div>
      )}
    </div>
  );
}

const HISTOGRAM_BARS = 32;

/** The surface's height distribution, each bar in the colour it takes on the map while the colours are on. */
function ElevationHistogram({ stats, ramp, range, bands }: { stats: TerrainStats; ramp: ElevationRampId | null; range: ElevationRange; bands: boolean }) {
  const bars = React.useMemo(() => histogramBars(stats, HISTOGRAM_BARS), [stats]);
  if (bars.length === 0) return null;
  const tallest = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div role="img" aria-label="Elevation distribution" className="flex h-14 items-end gap-0.5">
      {bars.map((b, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-[2px]"
          style={{
            height: `${b.count > 0 ? Math.max(4, (b.count / tallest) * 100) : 2}%`,
            background: ramp ? cssColorAt(ramp, b.height, range, bands) : "var(--n-04)",
            opacity: ramp && (b.height < range.min || b.height > range.max) ? 0.35 : 1,
          }}
        />
      ))}
    </div>
  );
}

/** A height typed in metres, committed on blur or Enter; a rejected value snaps back. */
function HeightInput({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => boolean }) {
  const [revision, setRevision] = useState(0);
  return (
    <Input
      key={`${value}:${revision}`}
      aria-label={label}
      defaultValue={value.toFixed(1)}
      inputMode="decimal"
      suffix="m"
      className="num"
      onBlur={(e) => {
        const text = e.currentTarget.value.trim();
        const next = Number(text);
        if (!text || !Number.isFinite(next) || !onCommit(next)) setRevision((r) => r + 1);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

const SHADING: ViewSettings["shading"][] = ["None", "Hillshade"];
const NO_COLORS = "none";

function formatIntervalLabel(m: number): string {
  return Number.isInteger(m) ? `${m}m` : `${m}m`;
}

function contourRole(role?: string): boolean {
  if (!role) return false;
  return role === "contours" || role.startsWith("contours_");
}

function formatElevationM(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)} m`;
}

/** Inline expandable settings for a DSM/DTM terrain layer: its opacity, and the
 * elevation colours and shading drawn on whichever surface is showing. */
function TerrainSettings({
  opacity,
  onOpacity,
  stats,
  elevation,
  onColorMapChange,
  onShadingChange,
  onElevationChange,
}: {
  opacity: number;
  onOpacity: (opacity: number) => void;
  stats?: TerrainStats;
  elevation: ElevationSettings;
} & ElevationHandlers) {
  const colors = elevation.elevationColors && !!stats;
  const auto = elevation.elevationRange === null;
  const range = stats ? (elevation.elevationRange ?? autoRange(stats)) : null;
  const bottom = stats && range ? Math.min(stats.histogram_min ?? stats.min_elevation, range.min) : 0;
  const top = stats && range ? Math.max(stats.histogram_max ?? stats.max_elevation, range.max) : 0;
  const step = top - bottom > 50 ? 0.5 : 0.1;
  const setRange = (next: ElevationRange) => onElevationChange({ elevationRange: next });

  return (
    <div className="mx-2 mb-2 flex flex-col gap-4 rounded-md border border-hairline bg-surface-2 p-3">
      <Slider
        label="Opacity"
        value={[Math.round(opacity * 100)]}
        min={0}
        max={100}
        step={1}
        format={(v) => `${Math.round(v)}%`}
        onValueChange={([v]) => onOpacity(v / 100)}
      />

      <Field label="Color map">
        <Select
          value={colors ? elevation.elevationRamp : NO_COLORS}
          onValueChange={(v) => onColorMapChange(isElevationRampId(v) ? v : null)}
          disabled={!stats}
          options={[{ value: NO_COLORS, label: "None" }, ...ELEVATION_RAMPS.map((r) => ({ value: r.id, label: r.label }))]}
        />
      </Field>

      {stats && range ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="caps text-ink-4">Range</p>
            <Button size="sm" variant="quiet" disabled={auto} onClick={() => onElevationChange({ elevationRange: null })}>
              Auto
            </Button>
          </div>
          <ElevationHistogram stats={stats} ramp={colors ? elevation.elevationRamp : null} range={range} bands={elevation.elevationBands} />
          <Slider
            aria-label="Color range"
            thumbLabels={["Range minimum", "Range maximum"]}
            value={[range.min, range.max]}
            min={bottom}
            max={top}
            step={step}
            minStepsBetweenThumbs={1}
            showValue={false}
            onValueChange={([min, max]) => setRange({ min, max })}
            className="mt-1"
          />
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <HeightInput
              label="Range minimum"
              value={range.min}
              onCommit={(min) => {
                if (min >= range.max) return false;
                setRange({ min, max: range.max });
                return true;
              }}
            />
            <span className="h-px w-2 shrink-0 bg-hairline-strong" />
            <HeightInput
              label="Range maximum"
              value={range.max}
              onCommit={(max) => {
                if (max <= range.min) return false;
                setRange({ min: range.min, max });
                return true;
              }}
            />
          </div>
          <p className="num-sm mt-1 text-ink-4">
            {auto ? `Auto: ${AUTO_RANGE_CLIP * 100}–${100 - AUTO_RANGE_CLIP * 100}% of the surface` : "Set by hand"} · Mean {formatElevationM(stats.mean)} · σ{" "}
            {stats.std_dev.toFixed(1)} m
          </p>
        </div>
      ) : (
        <p className="small text-ink-4">This surface has no elevation statistics, so it can&apos;t be colored by height.</p>
      )}

      {colors && (
        <>
          <Slider
            label="Color opacity"
            value={[Math.round(elevation.elevationOpacity * 100)]}
            min={0}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}%`}
            onValueChange={([v]) => onElevationChange({ elevationOpacity: v / 100 })}
          />
          <Switch
            label="Bands"
            labelPosition="start"
            size="sm"
            checked={elevation.elevationBands}
            onCheckedChange={(v) => onElevationChange({ elevationBands: v })}
          />
        </>
      )}

      <Field label="Shading">
        <Select
          value={elevation.shading}
          onValueChange={(v) => onShadingChange(v === "Hillshade" ? "Hillshade" : "None")}
          options={SHADING.map((v) => ({ value: v, label: v }))}
        />
      </Field>
    </div>
  );
}

/** A DSM/DTM row: switch + expandable settings card. */
function TerrainLayerRow({
  control,
  onToggle,
  onOpacity,
  elevation,
  ...handlers
}: {
  control: LayerControl;
  onToggle: () => void;
  onOpacity: (opacity: number) => void;
  elevation: ElevationSettings;
} & ElevationHandlers) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex h-9 items-center gap-2.5 px-2">
        <Icon icon={MountainIcon} size={16} className={`shrink-0 ${control.visible ? "text-ink-1" : "text-ink-4"}`} />
        <span className={`small min-w-0 flex-1 truncate ${control.visible ? "font-medium text-ink-1" : "text-ink-2"}`}>{control.label}</span>
        {control.loading && <ProgressCircle value={null} size="sm" aria-label={`Loading ${control.label}`} />}
        <IconButton
          icon={Settings01Icon}
          aria-label={`${control.label} settings`}
          aria-expanded={open}
          variant="bare"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className={open ? "text-ink-1" : undefined}
        />
        <Switch size="sm" aria-label={control.label} checked={control.visible} onCheckedChange={onToggle} />
      </div>
      {open && <TerrainSettings opacity={control.opacity} onOpacity={onOpacity} stats={control.stats} elevation={elevation} {...handlers} />}
    </div>
  );
}

/** Row controlling a whole group of layers (View Types master toggles). */
function GroupRow({
  icon,
  label,
  group,
  onToggle,
}: {
  icon: IconDefinition;
  label: string;
  group: LayerControl[];
  onToggle: (key: string) => void;
}) {
  const anyVisible = group.some((l) => l.visible);
  const loading = group.some((l) => l.loading);
  const error = group.find((l) => l.error)?.error ?? null;

  const toggleGroup = () => {
    if (anyVisible) {
      // Hide every visible member.
      group.filter((l) => l.visible).forEach((l) => onToggle(l.key));
    } else {
      // Show the first member (terrain exclusivity is handled upstream).
      const first = group[0];
      if (first) onToggle(first.key);
    }
  };

  return (
    <ControlRow
      icon={icon}
      label={label}
      active={anyVisible}
      loading={loading}
      error={error}
      onToggle={toggleGroup}
    />
  );
}

/** Picks a lens icon from its derived label (slope/gradient vs vegetation). */
function lensIcon(label: string): IconDefinition {
  const l = label.toLowerCase();
  if (l.includes("gradient") || l.includes("slope") || l.includes("aspect")) return AnalyticsUpIcon;
  return SparklesIcon;
}

export function LayerPanel({
  layers = [],
  designs = [],
  processing,
  surveyStatus,
  terrainExaggeration,
  exaggerationDisabled = false,
  baseMap,
  elevation,
  contourIntervalM,
  availableContourIntervals,
  digitalTwinEnabled = false,
  digitalTwinAvailable = false,
  showDigitalTwin = true,
  sunLightingEnabled = false,
  sunHour = 12,
  onToggle,
  onOpacity,
  onToggleDesign,
  onTerrainExaggeration,
  onSetBaseMap,
  onColorMapChange,
  onShadingChange,
  onElevationChange,
  onContourIntervalChange,
  onToggleDigitalTwin,
  onSunLightingChange,
}: LayerPanelProps) {
  const byPrefix = (prefix: string) => layers.filter((l) => l.key.startsWith(prefix));
  const ortho = byPrefix("ortho-");
  const terrain = byPrefix("terrain-");
  const lenses = byPrefix("lens-");
  const vectors = byPrefix("vector-");
  const contourVectors = vectors.filter((l) => contourRole(l.vectorRole));
  const pointClouds = byPrefix("pointcloud-");
  const siteModels = byPrefix("sitemodel-");

  return (
    <div className="flex flex-col pb-2">
      {processing && layers.length === 0 && (
        <Alert tone="info" title="Processing survey…" className="mx-2 mt-3 mb-2">
          Layers appear here when processors finish{surveyStatus ? ` (status: ${surveyStatus})` : ""}. Checking every 30s.
        </Alert>
      )}

      {(ortho.length > 0 || terrain.length > 0 || lenses.length > 0 || designs.length > 0) && (
        <Section title="Map layers" defaultOpen>
          {ortho.map((l) => (
            <ControlRow key={l.key} icon={Image01Icon} label={l.label} active={l.visible} loading={l.loading} error={l.error} onToggle={() => onToggle(l.key)} />
          ))}
          {terrain.map((l) => (
            <TerrainLayerRow
              key={l.key}
              control={l}
              onToggle={() => onToggle(l.key)}
              onOpacity={(o) => onOpacity(l.key, o)}
              elevation={elevation}
              onColorMapChange={onColorMapChange}
              onShadingChange={onShadingChange}
              onElevationChange={onElevationChange}
            />
          ))}
          {lenses.map((l) => (
            <ControlRow key={l.key} icon={lensIcon(l.label)} label={l.label} active={l.visible} loading={l.loading} error={l.error} onToggle={() => onToggle(l.key)} />
          ))}
          {designs.map((d) => (
            <ControlRow
              key={d.key}
              icon={PenTool02Icon}
              label={d.label}
              active={d.visible}
              disabled={!d.renderable}
              onToggle={() => onToggleDesign(d.key)}
              onDisabledClick={() => toast.info("This design isn't renderable yet — raw CAD is tiled server-side first")}
            />
          ))}
        </Section>
      )}

      <Section title="View types" defaultOpen>
        {terrain.length > 0 && <GroupRow icon={MountainIcon} label="Terrain" group={terrain} onToggle={onToggle} />}
        {contourVectors.length > 0 && <GroupRow icon={RippleIcon} label="Contour lines" group={contourVectors} onToggle={onToggle} />}
        {siteModels.length > 0 && <GroupRow icon={CubeIcon} label="3D model" group={siteModels} onToggle={onToggle} />}
        {pointClouds.length > 0 && <GroupRow icon={DistributionIcon} label="Point cloud" group={pointClouds} onToggle={onToggle} />}
        {showDigitalTwin && (
          <ControlRow
            icon={Building03Icon}
            label="Digital twin"
            active={digitalTwinEnabled}
            disabled={!digitalTwinAvailable}
            onToggle={() => onToggleDigitalTwin?.()}
            onDisabledClick={() => toast.info("Digital Twin requires a Cesium ion token (World Terrain)")}
          />
        )}
      </Section>

      <Section title="Map controls">
        <div className="flex h-9 items-center gap-2.5 px-2">
          <Icon icon={MapsIcon} size={16} className="shrink-0 text-ink-1" />
          <span className="small min-w-0 flex-1 text-ink-2">Base map</span>
          <Select variant="filter" aria-label="Base map" value={baseMap} onValueChange={onSetBaseMap} options={BASE_MAPS.map((b) => ({ value: b.id, label: b.label }))} />
        </div>

        <SunPositionRow enabled={sunLightingEnabled} hour={sunHour} onChange={(enabled, hour) => onSunLightingChange?.(enabled, hour)} />

        <div className="px-2 pt-2">
          <Slider
            label="Vertical exaggeration"
            value={[terrainExaggeration]}
            min={1}
            max={3}
            step={0.1}
            format={(v) => `${v.toFixed(1)}x`}
            disabled={exaggerationDisabled}
            onValueChange={([v]) => onTerrainExaggeration(v)}
          />
        </div>

        <div className="mt-1 flex h-9 items-center gap-2.5 px-2">
          <Icon icon={RippleIcon} size={16} className="shrink-0 text-ink-4" />
          <span className="small min-w-0 flex-1 text-ink-2">Contour interval</span>
          <Select
            variant="filter"
            aria-label="Contour interval"
            value={contourIntervalM != null ? String(contourIntervalM) : undefined}
            onValueChange={(v) => onContourIntervalChange(Number(v))}
            disabled={availableContourIntervals.length === 0}
            placeholder="—"
            options={availableContourIntervals.map((v) => ({ value: String(v), label: formatIntervalLabel(v) }))}
          />
        </div>
      </Section>
    </div>
  );
}
