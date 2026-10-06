"use client";

// Shared base-surface method editor (RE-PIVOT wiring) — the "how" of a volume
// calculation, rendered by BOTH the drawing-time Calculation panel
// (MeasurePalette) and the FeatureInspector's editable config. One component so
// the two never diverge (the teardown's §2 "type is mutable after creation"
// depends on the same knobs pre- and post-save). State is CONTROLLED — hosts
// own it (store-backed in the palette, local-edit in the inspector) and receive
// patches via onChange.
//
// Method semantics per docs/contracts/surface-ref.md §3.1 (see lib/viewer/calc):
// reference-rl takes elevation_m XOR derive lowest/highest vertex; design needs
// a design_id (picker fed by listDesigns); previous-survey resolves server-side
// to the chronologically previous survey; custom-base awaits its vertex editor.

import React, { useEffect, useId, useState } from "react";
import { Field, HelperText, Input, RadioGroup, Select, Skeleton } from "@puckoops/camelot";

import { listDesigns, type DesignRecord } from "@/lib/api/orblodeSvc";
import { methodsForKind, type CalcMethodState, type RefMode } from "@/lib/viewer/calc";

const REF_MODES: { id: RefMode; label: string }[] = [
  { id: "lowest_vertex", label: "Lowest boundary point" },
  { id: "highest_vertex", label: "Highest boundary point" },
  { id: "custom", label: "Custom elevation" },
];

export function CalcConfig({
  value,
  onChange,
  kind,
  projectId,
  idPrefix = "calc",
}: {
  value: CalcMethodState;
  onChange: (patch: Partial<CalcMethodState>) => void;
  /** Measurement kind — the base-method list is CALC-TYPE-AWARE (stockpile:
   * smart base/reference RL; cut_fill: previous survey/design/reference RL). */
  kind: string;
  /** For the design picker; null hides the list (no manifest yet). */
  projectId: string | null;
  /** Keeps radio input ids unique when two hosts are mounted at once. */
  idPrefix?: string;
}) {
  // Designs load lazily the first time the design-surface method is picked.
  const [designs, setDesigns] = useState<DesignRecord[] | null>(null);
  const [designsError, setDesignsError] = useState<string | null>(null);
  const wantDesigns = value.method === "design-surface" && projectId !== null;

  useEffect(() => {
    if (!wantDesigns || designs !== null || designsError !== null) return;
    let cancelled = false;
    listDesigns(projectId!)
      .then((res) => {
        if (!cancelled) setDesigns(res.designs ?? []);
      })
      .catch((err) => {
        if (!cancelled) setDesignsError(err instanceof Error ? err.message : "Failed to load designs");
      });
    return () => {
      cancelled = true;
    };
  }, [wantDesigns, designs, designsError, projectId]);

  const baseLabelId = `${useId()}-${idPrefix}-base`;
  const refLabelId = `${baseLabelId}-ref`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p id={baseLabelId} className="caps mb-2 text-ink-4">
          Base surface
        </p>
        <RadioGroup
          aria-labelledby={baseLabelId}
          value={value.method}
          onValueChange={(method) => onChange({ method })}
          options={methodsForKind(kind).map((item) => ({ value: item.id, label: item.label }))}
        />
      </div>

      {value.method === "reference-rl" && (
        <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-2.5">
          <p id={refLabelId} className="caps text-ink-4">
            Reference level
          </p>
          <RadioGroup
            aria-labelledby={refLabelId}
            value={value.refMode}
            onValueChange={(refMode) => onChange({ refMode: refMode as RefMode })}
            options={REF_MODES.map((m) => ({ value: m.id, label: m.label }))}
          />
          {value.refMode === "custom" && (
            <Field label="Elevation (m, site datum)">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={value.refElevation ?? ""}
                onChange={(e) => onChange({ refElevation: e.target.value === "" ? null : Number(e.target.value) })}
                className="num"
              />
            </Field>
          )}
        </div>
      )}

      {value.method === "previous-survey" && (
        <p className="caption rounded-md border border-hairline bg-surface-2 p-2.5 text-ink-3">
          Compares against the chronologically previous survey of this project — resolved automatically when the compute runs.
        </p>
      )}

      {value.method === "design-surface" && (
        <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-2 p-2.5">
          {designsError ? (
            <HelperText tone="error">{designsError}</HelperText>
          ) : designs === null ? (
            <Skeleton width="100%" height={36} />
          ) : designs.length === 0 ? (
            <HelperText>No designs are uploaded to this project yet. Upload one from Upload → Design.</HelperText>
          ) : (
            <Field label="Design surface">
              <Select
                value={value.baseDesignId ?? undefined}
                onValueChange={(id) => onChange({ baseDesignId: id || null })}
                placeholder="Pick a design…"
                options={designs.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
