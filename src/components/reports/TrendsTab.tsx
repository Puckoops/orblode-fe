"use client";

import { ChartLineData01Icon } from "@hugeicons/core-free-icons";
import { Alert, Band, EmptyState, LineChart, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { getTrends, type MaterialTrend, type TrendsReport } from "@/lib/api/orblodeSvc";
import { formatCubic, formatDelta, formatTonnes, trendSeries } from "@/lib/reports";
import { formatSurveyDate } from "@/lib/utils";

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function TrendsTab({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<TrendsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTrends(projectId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => {
        if (!cancelled) setError(message(err, "The trends couldn't load."));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error)
    return (
      <Alert tone="critical" title="The trends couldn't load">
        {error}
      </Alert>
    );
  if (!report) return <Loader label="Loading trends" />;
  if (report.materials.length === 0) {
    return (
      <EmptyState
        icon={ChartLineData01Icon}
        title="No survey of this project has computed stockpiles yet."
        description="Trends follow each material's stock from survey to survey."
        framed
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {report.gaps.length > 0 && (
        <Alert tone="warning" title={`${report.gaps.length} gap${report.gaps.length === 1 ? "" : "s"} of over 30 days between surveys`}>
          {report.gaps.map((g) => `${formatSurveyDate(g.from.date)} to ${formatSurveyDate(g.to.date)} (${g.days} days)`).join("; ")}. Trends
          across a gap are less certain.
        </Alert>
      )}
      {report.materials.map((m, i) => (
        <MaterialTrendBand key={`${m.material_id}/${m.name}`} trend={m} first={i === 0} />
      ))}
    </div>
  );
}

function MaterialTrendBand({ trend, first }: { trend: MaterialTrend; first: boolean }) {
  const series = trendSeries(trend);
  const fmt = series.unit === "t" ? formatTonnes : formatCubic;
  const slope = trend.slope_t_per_day;
  const caption =
    series.unit === "m³"
      ? "In cubic metres: the material has no density, so no tonnage or forecast."
      : slope == null
        ? "One survey so far; a trend needs two."
        : `${formatDelta(slope, "t")} a day${trend.depletion_date ? ` · empty around ${formatSurveyDate(trend.depletion_date)} at this rate` : ""}`;

  return (
    <Band heading={trend.name} caption={caption} first={first}>
      <div className="flex flex-col gap-4">
        <LineChart
          title={`${trend.name} stock by survey`}
          data={series.data.map((d) => ({ ...d, label: formatSurveyDate(d.label) }))}
          seriesLabel={series.unit === "t" ? "Surveyed tonnage" : "Surveyed volume"}
          comparisonLabel="Trend line"
          categoryLabel="Survey"
          format={fmt}
          height={220}
        />
        {series.unit === "t" && trend.forecast.length > 0 && (
          <Table density="compact" footer={trend.forecast[0].low_t == null ? "Ranges need three surveys or more." : "95 % prediction range."}>
            <THead>
              <Tr>
                <Th>Forecast</Th>
                <Th numeric>Stock</Th>
                <Th numeric>Range</Th>
              </Tr>
            </THead>
            <TBody>
              {trend.forecast.map((f) => (
                <Tr key={f.date}>
                  <Td primary>{formatSurveyDate(f.date)}</Td>
                  <Td numeric>{formatTonnes(f.tonnage_t)}</Td>
                  <Td numeric>{f.low_t != null && f.high_t != null ? `${formatTonnes(f.low_t)} – ${formatTonnes(f.high_t)}` : "—"}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        {trend.anomalies.length > 0 && (
          <Alert tone="info" title="Unusual changes">
            {trend.anomalies
              .map((a) => `${formatSurveyDate(a.date)}: ${formatDelta(a.delta_t, "t")} (${Math.abs(a.z).toFixed(1)} standard deviations from the usual change)`)
              .join("; ")}
          </Alert>
        )}
      </div>
    </Band>
  );
}
