"use client";

// Comparison card (Compare Mode, Task 3) — the inspector headline for a
// TEMPORAL compare measurement (a polygon drawn while compare was active, whose
// params.from/to name two different surveys via survey_terrain refs). Renders
//   [A survey_date] → [B survey_date]   cut X m³ · fill Y m³ · net Δ m³
// pulling cut_volume_m3 / fill_volume_m3 / net_change_m3 from the result doc.
// Δ (net) is green when positive (net fill / gain) and red when negative (net
// cut / loss). Dates resolve from the project's survey list. Mounted by
// FeatureInspector ONLY when temporalComparePair(params) is truthy, so the
// survey fetch never fires for ordinary single-survey measurements.

import { ArrowRight02Icon, CalendarCheckIn01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@puckoops/camelot";

import type { Measurement } from "@/lib/api/orblodeSvc";
import type { PanelMeasurement } from "@/lib/viewer/sampleData";
import { metricsOf, resultForKind } from "@/lib/viewer/calc";
import { formatSurveyDate } from "@/lib/utils";
import { useCompareSurveys } from "@/components/viewer/shell/hooks/useCompareSurveys";

/** Server-computed volumes only — the frontend renders, never derives. */
function formatVolume(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`;
}

/** Signed net change, kept explicit so a gain reads "+…" against a loss "−…". */
function formatSignedVolume(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`;
}

export function ComparisonCard({
  measurement,
  projectId,
  pair,
}: {
  measurement: Measurement | PanelMeasurement;
  projectId: string | null;
  /** The ordered before/after survey ids (from temporalComparePair). */
  pair: { aId: string; bId: string };
}) {
  const { dateOf } = useCompareSurveys(projectId);

  const aDate = dateOf.get(pair.aId);
  const bDate = dateOf.get(pair.bId);

  const metrics = metricsOf(resultForKind(measurement));
  const cut = metrics.cut_volume_m3;
  const fill = metrics.fill_volume_m3;
  const net = metrics.net_change_m3;
  const hasResult =
    typeof cut === "number" || typeof fill === "number" || typeof net === "number";

  const netColor = typeof net !== "number" || net === 0 ? "text-ink-1" : net > 0 ? "text-delta-up" : "text-delta-down";

  return (
    <div className="rounded-md border border-hairline-strong bg-surface p-3">
      {/* A → B epoch header. */}
      <div className="mb-2 flex items-center gap-1.5">
        <Icon icon={CalendarCheckIn01Icon} size={16} className="shrink-0 text-ink-2" />
        <span className="num-sm text-ink-1">{aDate ? formatSurveyDate(aDate) : "Survey A"}</span>
        <Icon icon={ArrowRight02Icon} size={16} className="shrink-0 text-ink-4" />
        <span className="num-sm text-ink-1">{bDate ? formatSurveyDate(bDate) : "Survey B"}</span>
        <span className="caps ml-auto text-ink-4">Compare</span>
      </div>

      {hasResult ? (
        <div className="num flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-ink-3">
            cut <span className="text-ink-1">{formatVolume(cut)}</span>
          </span>
          <span className="text-ink-4">·</span>
          <span className="text-ink-3">
            fill <span className="text-ink-1">{formatVolume(fill)}</span>
          </span>
          <span className="text-ink-4">·</span>
          <span className="text-ink-3">
            net <span className={netColor}>{formatSignedVolume(net)}</span>
          </span>
        </div>
      ) : (
        <p className="caption text-ink-4">
          Awaiting compute — cut / fill / net will appear when the diff finishes.
        </p>
      )}
    </div>
  );
}
