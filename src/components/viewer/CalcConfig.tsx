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
// reference-rl takes elevation_m XOR derive lowest/highest vertex;
// previous-survey resolves server-side to the project's previous survey with
// that surface; other-survey names one from the project's survey list;
// design-surface names a design whose surface is ready.

import { useId } from "react";
import { Field, HelperText, Input, RadioGroup, Select, Skeleton } from "@puckoops/camelot";

import { methodsForKind, type CalcMethodState, type RefMode, type SurfaceKind } from "@/lib/viewer/calc";
import { formatSurveyDate } from "@/lib/utils";
import { useCompareSurveys } from "@/components/viewer/shell/hooks/useCompareSurveys";
import { useProjectDesigns } from "@/components/viewer/shell/hooks/useProjectDesigns";
import { useProjectMaterials } from "@/components/viewer/shell/hooks/useProjectMaterials";

const SURFACES: { id: SurfaceKind; label: string }[] = [
  { id: "dsm", label: "Surface (DSM)" },
  { id: "dtm", label: "Ground (DTM)" },
];

const NO_MATERIAL = "none";

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
  surveyId,
  idPrefix = "calc",
}: {
  value: CalcMethodState;
  onChange: (patch: Partial<CalcMethodState>) => void;
  /** Measurement kind — non-volume kinds offer no base methods. */
  kind: string;
  /** The survey's project and the survey itself, for the other-survey picker. */
  projectId: string | null;
  surveyId: string;
  /** Keeps radio input ids unique when two hosts are mounted at once. */
  idPrefix?: string;
}) {
  const baseLabelId = `${useId()}-${idPrefix}-base`;
  const refLabelId = `${baseLabelId}-ref`;
  const surfaceLabelId = `${baseLabelId}-surface`;
  const surveyMethod = value.method === "previous-survey" || value.method === "other-survey";
  const { surveys } = useCompareSurveys(value.method === "other-survey" ? projectId : null);
  const others = surveys?.filter((s) => s.id !== surveyId) ?? null;
  const { designs } = useProjectDesigns(value.method === "design-surface" ? projectId : null);
  const readyDesigns = designs?.filter((d) => d.surface?.status === "ready") ?? null;
  const processingDesigns = designs?.filter((d) => d.surface?.status === "processing").length ?? 0;
  const materials = useProjectMaterials(projectId);

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
            <Field label="Elevation (m, project datum)">
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

      {value.method === "design-surface" && (
        <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-2.5">
          {readyDesigns === null ? (
            <Skeleton width="100%" height={36} />
          ) : readyDesigns.length === 0 ? (
            <HelperText>
              No design surface is ready. Upload a LandXML, DXF, OBJ or GeoJSON design, or process one from the Designs panel.
            </HelperText>
          ) : (
            <Field label="Design surface">
              <Select
                value={value.baseDesignId ?? undefined}
                onValueChange={(id) => onChange({ baseDesignId: id || null })}
                placeholder="Pick a design…"
                options={readyDesigns.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Field>
          )}
          {processingDesigns > 0 && (
            <p className="caption text-ink-4">
              {processingDesigns} more {processingDesigns === 1 ? "design is" : "designs are"} still being processed.
            </p>
          )}
        </div>
      )}

      {surveyMethod && (
        <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-2.5">
          {value.method === "previous-survey" ? (
            <p className="caption text-ink-3">Compares against the project&apos;s previous survey, found when the compute runs.</p>
          ) : others === null ? (
            <Skeleton width="100%" height={36} />
          ) : others.length === 0 ? (
            <HelperText>This project has no other survey to compare against.</HelperText>
          ) : (
            <Field label="Compare against">
              <Select
                value={value.baseSurveyId ?? undefined}
                onValueChange={(id) => onChange({ baseSurveyId: id || null })}
                placeholder="Pick a survey…"
                options={others.map((s) => ({ value: s.id, label: s.survey_date ? formatSurveyDate(s.survey_date) : s.id }))}
              />
            </Field>
          )}
          <p id={surfaceLabelId} className="caps text-ink-4">
            Terrain
          </p>
          <RadioGroup
            aria-labelledby={surfaceLabelId}
            value={value.surface}
            onValueChange={(surface) => onChange({ surface: surface as SurfaceKind })}
            options={SURFACES.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
      )}
      {materials && materials.length > 0 && (
        <Field label="Material">
          <Select
            value={value.materialId ?? NO_MATERIAL}
            onValueChange={(id) => onChange({ materialId: id === NO_MATERIAL ? null : id })}
            options={[
              { value: NO_MATERIAL, label: "None" },
              ...materials.map((m) => ({ value: m.id, label: m.name })),
              ...(value.materialId && !materials.some((m) => m.id === value.materialId)
                ? [{ value: value.materialId, label: "Deleted material" }]
                : []),
            ]}
          />
        </Field>
      )}
    </div>
  );
}
