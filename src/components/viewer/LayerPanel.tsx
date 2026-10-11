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
import { Alert, Field, Glyph, Icon, IconButton, Input, ProgressCircle, Select, Slider, Sparkbars, Switch, Tooltip, type IconDefinition } from "@puckoops/camelot";
import { Collapsible } from "radix-ui";
import { toast } from "@/lib/toast";
import type { TerrainStats } from "@/lib/api/orblodeSvc";

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
  /** Baked lens ramp key (elevation colormaps, hillshade, slope, …). */
  lensRamp?: string;
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

interface LayerPanelProps {
  layers: LayerControl[];
  designs: DesignControl[];
  processing: boolean;
  surveyStatus?: string;
  terrainExaggeration: number;
  /** 2D draws the site flat, so there is no relief to exaggerate. */
  exaggerationDisabled?: boolean;
  baseMap: string;
  colorMap: string;
  shading: string;
  availableColorMaps: string[];
  hasHillshade: boolean;
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
  onColorMapChange: (value: string) => void;
  onShadingChange: (value: string) => void;
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

/** Elevation-distribution histogram. Renders the surface's real per-bucket
 * counts when the manifest carries stats; otherwise falls back to a
 * deterministic presentational stand-in. */
function Histogram({ buckets }: { buckets?: number[] }) {
  const bars = React.useMemo(() => {
    if (buckets && buckets.length > 0) {
      // Compress to ~26 display bars and normalize against the tallest.
      const display = 26;
      const grouped =
        buckets.length <= display
          ? buckets
          : Array.from({ length: display }, (_, i) => {
              const lo = Math.floor((i * buckets.length) / display);
              const hi = Math.floor(((i + 1) * buckets.length) / display);
              let sum = 0;
              for (let j = lo; j < hi; j++) sum += buckets[j];
              return sum;
            });
      const max = Math.max(...grouped, 1);
      return grouped.map((v) => (v > 0 ? Math.max(0.04, v / max) : 0.02));
    }
    return Array.from({ length: 26 }, (_, i) => {
      const v = Math.sin(i * 0.7) * 0.5 + Math.cos(i * 1.9) * 0.25 + 0.6;
      return Math.max(0.25, Math.min(1, v));
    });
  }, [buckets]);
  return <Sparkbars values={bars} highlight={bars.length} height={56} label="Elevation distribution" />;
}

const SHADING = ["None", "Hillshade"];

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

/** Inline expandable settings for a DSM/DTM terrain layer. Opacity is wired to
 * the real tileset; colormap/shading switch baked lens overlays when present. */
function TerrainSettings({
  opacity,
  onOpacity,
  stats,
  colorMap,
  shading,
  availableColorMaps,
  hasHillshade,
  onColorMapChange,
  onShadingChange,
}: {
  opacity: number;
  onOpacity: (opacity: number) => void;
  stats?: TerrainStats;
  colorMap: string;
  shading: string;
  availableColorMaps: string[];
  hasHillshade: boolean;
  onColorMapChange: (value: string) => void;
  onShadingChange: (value: string) => void;
}) {
  const [range, setRange] = useState(() => ({
    min: stats ? String(Math.round(stats.min_elevation)) : "0",
    max: stats ? String(Math.round(stats.max_elevation)) : "100",
  }));

  // Re-sync the range inputs when a new stats object arrives (survey switch).
  // Done as a render-phase adjustment rather than an effect: no extra commit,
  // no set-state-in-effect, and the fresh range renders on the first paint.
  // (React's documented "adjust state on prop change" pattern — the previous
  // value is tracked in state, not a ref, so it stays render-safe.)
  const [prevStats, setPrevStats] = useState(stats);
  if (stats && stats !== prevStats) {
    setPrevStats(stats);
    setRange({
      min: String(Math.round(stats.min_elevation)),
      max: String(Math.round(stats.max_elevation)),
    });
  }

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

      <div>
        <p className="caps mb-1.5 text-ink-4">Histogram</p>
        <Histogram buckets={stats?.histogram} />
        {stats && (
          <div className="num-sm mt-1 flex justify-between text-ink-4">
            <span>{formatElevationM(stats.histogram_min ?? stats.min_elevation)}</span>
            <span>{formatElevationM(stats.histogram_max ?? stats.max_elevation)}</span>
          </div>
        )}
      </div>

      <div>
        <p className="caps mb-1.5 text-ink-4">Range</p>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Range minimum"
            value={range.min}
            onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))}
            inputMode="numeric"
            readOnly={!!stats}
            className="num"
          />
          <span className="h-px w-2 shrink-0 bg-hairline-strong" />
          <Input
            aria-label="Range maximum"
            value={range.max}
            onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))}
            inputMode="numeric"
            readOnly={!!stats}
            className="num"
          />
        </div>
        {stats && (
          <p className="num-sm mt-1 text-ink-4">
            Mean {formatElevationM(stats.mean)} · σ {stats.std_dev.toFixed(1)} m
          </p>
        )}
      </div>

      <Field label="Color map">
        <Select
          value={colorMap}
          onValueChange={onColorMapChange}
          disabled={availableColorMaps.length === 0}
          placeholder={availableColorMaps.length ? undefined : "None available"}
          options={[{ value: "None", label: "None" }, ...availableColorMaps.map((c) => ({ value: c, label: c }))]}
        />
      </Field>

      <Field label="Shading">
        <Select value={shading} onValueChange={onShadingChange} disabled={!hasHillshade} options={SHADING.map((v) => ({ value: v, label: v }))} />
      </Field>
    </div>
  );
}

/** A DSM/DTM row: switch + expandable settings card. */
function TerrainLayerRow({
  control,
  onToggle,
  onOpacity,
  colorMap,
  shading,
  availableColorMaps,
  hasHillshade,
  onColorMapChange,
  onShadingChange,
}: {
  control: LayerControl;
  onToggle: () => void;
  onOpacity: (opacity: number) => void;
  colorMap: string;
  shading: string;
  availableColorMaps: string[];
  hasHillshade: boolean;
  onColorMapChange: (value: string) => void;
  onShadingChange: (value: string) => void;
}) {
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
      {open && (
        <TerrainSettings
          opacity={control.opacity}
          onOpacity={onOpacity}
          stats={control.stats}
          colorMap={colorMap}
          shading={shading}
          availableColorMaps={availableColorMaps}
          hasHillshade={hasHillshade}
          onColorMapChange={onColorMapChange}
          onShadingChange={onShadingChange}
        />
      )}
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
  colorMap,
  shading,
  availableColorMaps,
  hasHillshade,
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
  onContourIntervalChange,
  onToggleDigitalTwin,
  onSunLightingChange,
}: LayerPanelProps) {
  const byPrefix = (prefix: string) => layers.filter((l) => l.key.startsWith(prefix));
  const ortho = byPrefix("ortho-");
  const terrain = byPrefix("terrain-");
  const lenses = byPrefix("lens-").filter(
    (l) => !l.lensRamp || !["viridis", "terrain", "plasma", "grayscale", "hillshade"].includes(l.lensRamp)
  );
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
              colorMap={colorMap}
              shading={shading}
              availableColorMaps={availableColorMaps}
              hasHillshade={hasHillshade}
              onColorMapChange={onColorMapChange}
              onShadingChange={onShadingChange}
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
