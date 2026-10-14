"use client";

// A line measurement's cross-section: its settings in params.cross_section,
// saved with the row updated in the store first so the inspector and the
// chart follow at once, and the names its surfaces go by. Saves to one
// measurement go out one after another, so the last one made is the one kept.

import { useCallback, useMemo } from "react";

import type { Measurement } from "@/lib/api/orblodeSvc";
import { crossSectionOf, type CompareRef, type CrossSectionSettings } from "@/lib/viewer/profile";
import { useViewerStore, useViewerStoreApi } from "@/lib/viewer/state/store";
import { useViewerActions } from "@/components/viewer/shell/viewerActions";
import { useCompareSurveys } from "@/components/viewer/shell/hooks/useCompareSurveys";
import { useProjectDesigns } from "@/components/viewer/shell/hooks/useProjectDesigns";
import { formatSurveyDate } from "@/lib/utils";

const queued = new Map<string, Promise<void>>();
/** The cross_section the server last confirmed, per measurement, while saves are in flight. */
const confirmed = new Map<string, unknown>();

export function useCrossSectionSettings(measurement: Pick<Measurement, "id" | "params"> | null) {
  const store = useViewerStoreApi();
  const { patchMeasurement } = useViewerActions();
  const id = measurement?.id ?? null;
  const settings = useMemo(
    () => (measurement ? crossSectionOf(measurement.params) : null),
    [measurement]
  );

  const save = useCallback(
    (next: CrossSectionSettings): Promise<void> => {
      if (!id) return Promise.resolve();
      const value = { show: next.show, compare: next.compare };
      const show = (crossSection: unknown) =>
        store.getState().setMeasurements(
          store.getState().measurements.map((m) => (m.id === id ? { ...m, params: { ...(m.params ?? {}), cross_section: crossSection } } : m))
        );
      if (!queued.has(id)) confirmed.set(id, store.getState().measurements.find((m) => m.id === id)?.params?.cross_section);
      show(value);
      const run: Promise<void> = (queued.get(id) ?? Promise.resolve()).then(async () => {
        try {
          await patchMeasurement(id, { params: { cross_section: value } });
          confirmed.set(id, value);
        } catch {
          if (queued.get(id) === run) show(confirmed.get(id));
        } finally {
          if (queued.get(id) === run) {
            queued.delete(id);
            confirmed.delete(id);
          }
        }
      });
      queued.set(id, run);
      return run;
    },
    [id, store, patchMeasurement]
  );

  return { settings, save };
}

export interface SurfaceNames {
  /** The survey's own DSM, the chart's first series. */
  primary: string;
  of: (ref: CompareRef) => string;
}

export function useSurfaceNames(unitsLabel: (m: number) => string): SurfaceNames & {
  surveys: ReturnType<typeof useCompareSurveys>["surveys"];
  designs: ReturnType<typeof useProjectDesigns>["designs"];
} {
  const projectId = useViewerStore((s) => s.manifest?.survey.project_id ?? null);
  const surveyDate = useViewerStore((s) => s.manifest?.survey.survey_date ?? "");
  const { surveys, dateOf } = useCompareSurveys(projectId);
  const { designs } = useProjectDesigns(projectId);

  const of = useCallback(
    (ref: CompareRef) => {
      switch (ref.type) {
        case "survey_terrain": {
          const date = dateOf.get(ref.survey_id);
          return `${date ? formatSurveyDate(date) : "Survey"} · ${ref.surface.toUpperCase()}`;
        }
        case "design":
          return designs?.find((d) => d.id === ref.design_id)?.name ?? "Design";
        case "reference_level":
          return `RL ${unitsLabel(ref.elevation_m)}`;
      }
    },
    [dateOf, designs, unitsLabel]
  );

  return useMemo(
    () => ({ primary: `${surveyDate ? formatSurveyDate(surveyDate) : "This survey"} · DSM`, of, surveys, designs }),
    [surveyDate, of, surveys, designs]
  );
}
