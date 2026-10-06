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
// only the instant methods are offered; reference-rl takes elevation_m XOR
// derive lowest/highest vertex.

import { useId } from "react";
import { Field, Input, RadioGroup } from "@puckoops/camelot";

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
  idPrefix = "calc",
}: {
  value: CalcMethodState;
  onChange: (patch: Partial<CalcMethodState>) => void;
  /** Measurement kind — non-volume kinds offer no base methods. */
  kind: string;
  /** Keeps radio input ids unique when two hosts are mounted at once. */
  idPrefix?: string;
}) {
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
    </div>
  );
}
