"use client";

// Design-vs-as-built (grade conformance) panel — the viewer-side surface for the
// "design-compare" processor, a sibling of LayerPanel in the `survey` module's
// left dock. Presentational only (props in, callbacks out; store wiring lives in
// TreePanel), matching LayerPanel's convention. Two jobs:
//   1. TRIGGER — a design picker (eligible designs from the manifest) + a
//      "Compare to design" button, modelled on LayerPanel's GenerateContoursControl.
//   2. RESULT — for each site-wide design-conformance cut/fill entry: the
//      over/under-grade numbers, a small cut/fill legend, and (when the backend
//      emitted a heatmap tile pyramid) a toggle + opacity for the heatmap
//      ImageryLayer — the same `onToggle`/`onOpacity` the ortho layers use.

import React, { useState } from "react";
import { ArrowRight01Icon, Image01Icon, PenTool02Icon } from "@hugeicons/core-free-icons";
import { Button, Field, Glyph, Icon, ProgressCircle, Select, Slider, Switch, Tooltip } from "@puckoops/camelot";
import { Collapsible } from "radix-ui";
import { CONFORMANCE_OVER, CONFORMANCE_UNDER } from "@/lib/viewer/sceneStyle";

/** One design offered to the compare picker. `eligible` is false for formats the
 * processor can't consume yet (everything but LandXML / GeoTIFF). */
export interface DesignCompareOption {
  id: string;
  name: string;
  format: string;
  eligible: boolean;
}

/** The matching heatmap layer control for a conformance result — present only
 * when the backend emitted a heatmap tile pyramid. */
export interface ConformanceLayerVM {
  key: string; // "conformance-{i}" — the LayerControl key for onToggle/onOpacity
  visible: boolean;
  opacity: number;
  loading?: boolean;
  error?: string | null;
}

/** A site-wide design-conformance result. Volume semantics (contract): cut =
 * over-built (survey above design → remove), fill = under-built (below design →
 * add), net = signed net change. */
export interface ConformanceResultVM {
  label: string;
  cutM3: number;
  fillM3: number;
  netM3: number;
  layer?: ConformanceLayerVM;
}

interface DesignConformancePanelProps {
  designOptions: DesignCompareOption[];
  /** Survey has a DSM/DTM raw_raster_url AND at least one eligible design. */
  canCompare: boolean;
  /** A design-compare dispatch is in flight (button shows a spinner). */
  generating: boolean;
  results: ConformanceResultVM[];
  onCompareToDesign: (designId: string) => void;
  onToggle: (key: string) => void;
  onOpacity: (key: string, opacity: number) => void;
}

/** Legend key for the heatmap: the same colours the tiles are rendered in. */
function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-[2px]" style={{ background: color }} />;
}

function fmtM3(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`;
}

function fmtSignedM3(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`;
}

/** Design picker + "Compare to design" button. Mirrors GenerateContoursControl:
 * a control the user configures then fires, whose result lands asynchronously. */
function CompareToDesignControl({
  designOptions,
  canCompare,
  generating,
  onCompareToDesign,
}: {
  designOptions: DesignCompareOption[];
  canCompare: boolean;
  generating: boolean;
  onCompareToDesign: (designId: string) => void;
}) {
  const eligible = designOptions.filter((d) => d.eligible);
  const hasIneligibleOnly = eligible.length === 0 && designOptions.length > 0;

  const [selectedId, setSelectedId] = useState<string | null>(eligible[0]?.id ?? null);
  // Re-seed the selection when the eligible set changes (survey switch / a new
  // design lands) — the render-phase "adjust state on prop change" pattern
  // LayerPanel uses, so no set-state-in-effect.
  const eligibleKey = eligible.map((d) => d.id).join(",");
  const [prevKey, setPrevKey] = useState(eligibleKey);
  if (eligibleKey !== prevKey) {
    setPrevKey(eligibleKey);
    if (!eligible.some((d) => d.id === selectedId)) {
      setSelectedId(eligible[0]?.id ?? null);
    }
  }

  const disabled = !canCompare || generating || !selectedId;

  return (
    <div className="flex flex-col gap-1.5">
      <Field
        label="Compare to design"
        hint={
          hasIneligibleOnly
            ? "LandXML designs only for now."
            : designOptions.length === 0
              ? "Upload a design to compare against the survey."
              : canCompare
                ? "Builds a cut/fill conformance heatmap for the whole survey."
                : "Needs a processed DSM/DTM surface."
        }
      >
        <Select
          value={selectedId ?? undefined}
          onValueChange={setSelectedId}
          disabled={eligible.length === 0 || generating}
          placeholder={eligible.length ? undefined : "No design"}
          options={eligible.map((d) => ({ value: d.id, label: `${d.name}${d.format ? ` (${d.format})` : ""}` }))}
        />
      </Field>
      <Button
        variant="primary"
        size="sm"
        disabled={disabled && !generating}
        loading={generating}
        onClick={() => selectedId && onCompareToDesign(selectedId)}
        className="self-start"
      >
        {generating ? "Comparing…" : "Compare"}
      </Button>
    </div>
  );
}

/** Cut/fill legend + over/under/net numbers for one conformance result, plus the
 * heatmap overlay toggle + opacity when a tile pyramid exists. */
function ConformanceResult({
  result,
  onToggle,
  onOpacity,
}: {
  result: ConformanceResultVM;
  onToggle: (key: string) => void;
  onOpacity: (key: string, opacity: number) => void;
}) {
  const { layer } = result;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface-2 p-3">
      {layer && (
        <div className="flex h-7 items-center gap-2.5">
          <Icon icon={Image01Icon} size={16} className={`shrink-0 ${layer.visible ? "text-ink-1" : "text-ink-4"}`} />
          <span className={`small min-w-0 flex-1 truncate ${layer.visible ? "font-medium text-ink-1" : "text-ink-2"}`}>{result.label}</span>
          {layer.loading && <ProgressCircle value={null} size="sm" aria-label="Loading heatmap" />}
          {!layer.loading && layer.error && (
            <Tooltip content={layer.error}>
              <span className="flex shrink-0 text-ink-2" tabIndex={0} aria-label={`Failed to load: ${layer.error}`}>
                <Glyph shape="triangle" />
              </span>
            </Tooltip>
          )}
          <Switch size="sm" aria-label={`${result.label} heatmap`} checked={layer.visible} onCheckedChange={() => onToggle(layer.key)} />
        </div>
      )}

      {layer && layer.visible && (
        <Slider
          label="Heatmap opacity"
          value={[Math.round(layer.opacity * 100)]}
          min={0}
          max={100}
          step={1}
          format={(v) => `${Math.round(v)}%`}
          onValueChange={([v]) => onOpacity(layer.key, v / 100)}
        />
      )}

      {/* Numbers — always shown, even when the heatmap tiles aren't ready. */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="flex items-center justify-center gap-1">
            <Swatch color={CONFORMANCE_OVER} />
            <span className="caps text-ink-4">Over</span>
          </dt>
          <dd className="num mt-0.5 text-ink-1">{fmtM3(result.cutM3)}</dd>
        </div>
        <div>
          <dt className="flex items-center justify-center gap-1">
            <Swatch color={CONFORMANCE_UNDER} />
            <span className="caps text-ink-4">Under</span>
          </dt>
          <dd className="num mt-0.5 text-ink-1">{fmtM3(result.fillM3)}</dd>
        </div>
        <div>
          <dt className="caps text-ink-4">Net</dt>
          <dd className="num mt-0.5 text-ink-1">{fmtSignedM3(result.netM3)}</dd>
        </div>
      </dl>
      <p className="caption text-ink-4">
        <Swatch color={CONFORMANCE_OVER} /> Over-grade = built above design (cut to remove); <Swatch color={CONFORMANCE_UNDER} /> under-grade =
        below design (fill to add).
      </p>
    </div>
  );
}

export function DesignConformancePanel({
  designOptions,
  canCompare,
  generating,
  results,
  onCompareToDesign,
  onToggle,
  onOpacity,
}: DesignConformancePanelProps) {
  const [open, setOpen] = useState(false);

  // Nothing to offer and nothing to show — keep the dock clean.
  if (designOptions.length === 0 && results.length === 0) return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="flex w-full items-center gap-1.5 px-2 pt-4 pb-1.5 text-left">
        <Icon icon={ArrowRight01Icon} size={16} className={`shrink-0 text-ink-4 transition-transform ${open ? "rotate-90" : ""}`} />
        <Icon icon={PenTool02Icon} size={16} className="shrink-0 text-ink-2" />
        <span className="caps text-ink-2">Design conformance</span>
        {generating && <ProgressCircle value={null} size="sm" aria-label="Comparing" className="ml-auto" />}
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-1">
        <div className="mx-2 mb-2 rounded-md border border-hairline bg-surface-2 p-3">
          <CompareToDesignControl designOptions={designOptions} canCompare={canCompare} generating={generating} onCompareToDesign={onCompareToDesign} />
        </div>
        {results.length > 0 && (
          <div className="mx-2 flex flex-col gap-2">
            {results.map((r, i) => (
              <ConformanceResult key={r.layer?.key ?? `conformance-result-${i}`} result={r} onToggle={onToggle} onOpacity={onOpacity} />
            ))}
          </div>
        )}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
