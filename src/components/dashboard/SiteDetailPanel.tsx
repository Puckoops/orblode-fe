"use client";

import { ArrowRight01Icon, Cancel01Icon, PencilEdit02Icon, SatelliteIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Alert, Badge, Button, EmptyState, Icon, IconButton } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { EditSurveyDrawer } from "@/components/survey/EditSurveyDrawer";
import { getProject, type Project } from "@/lib/api/userSvc";
import { getInventory, listSurveys, type Survey } from "@/lib/api/orblodeSvc";
import { useProcessing } from "@/lib/processing/store";
import { failedInProject, failureTitle } from "@/lib/processing/summary";
import { lifecycleState, PROCESSING_FAILED, surveyState } from "@/lib/status";
import { toast } from "@/lib/toast";
import { formatSurveyDate } from "@/lib/utils";

export function SiteDetailPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stockpiles, setStockpiles] = useState<{ surveyId: string; count: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [surveysTick, setSurveysTick] = useState(0);
  const failed = useProcessing((s) => s.failed);
  const retry = useProcessing((s) => s.retry);
  const failedHere = useMemo(() => failedInProject(failed, projectId), [failed, projectId]);
  const failedIds = useMemo(() => new Set(failedHere.map((s) => s.survey_id)), [failedHere]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    // A fast site switch must not let an earlier response overwrite the current site's data.
    let cancelled = false;
    getProject(projectId)
      .then((p) => {
        if (!cancelled) setProjectData(p);
      })
      .catch((err) => console.error("Failed to fetch project details:", err));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listSurveys(projectId)
      .then((res) => {
        if (cancelled) return;
        // Newest first: "Open viewer" opens surveys[0], and this list, SurveyList and the site list
        // must agree on which survey is the latest.
        setSurveys((res.surveys || []).slice().sort((a, b) => b.survey_date.localeCompare(a.survey_date)));
      })
      .catch((err) => console.error("Failed to fetch surveys:", err));
    return () => {
      cancelled = true;
    };
  }, [projectId, surveysTick]);

  const latestSurveyId = surveys[0]?.id;

  useEffect(() => {
    if (!latestSurveyId) return;
    let cancelled = false;
    getInventory(latestSurveyId)
      .then((inv) => {
        if (!cancelled) setStockpiles({ surveyId: latestSurveyId, count: inv.totals.piles });
      })
      .catch((err) => console.error("Failed to fetch the inventory:", err));
    return () => {
      cancelled = true;
    };
  }, [latestSurveyId]);

  if (!projectData) return null;

  const retryable = failedHere.flatMap((s) => s.failures.filter((f) => f.retryable));
  const dateOf = (surveyId: string) => {
    const survey = surveys.find((s) => s.id === surveyId);
    return survey ? formatSurveyDate(survey.survey_date) : "A survey";
  };
  const retryAll = async () => {
    setRetrying(true);
    try {
      const started = (await Promise.all(failedHere.map((s) => retry(s.survey_id, s.failures)))).reduce((a, b) => a + b, 0);
      if (started === retryable.length) toast.success(started === 1 ? "Processing again" : `Processing ${started} again`);
      else toast.error("Some processors couldn't be started again. Try again in a moment.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <aside
      aria-label={projectData.name}
      className="absolute top-4 right-6 bottom-4 z-10 flex w-[360px] flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-[var(--shadow-overlay)]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="h2">{projectData.name}</h2>
          <IconButton icon={Cancel01Icon} aria-label="Close site details" variant="bare" size="sm" onClick={onClose} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StateChip state={lifecycleState(projectData.lifecycle_status)} />
          {projectData.primary_material && <Badge variant="tag">{projectData.primary_material}</Badge>}
        </div>

        <p className="caption text-ink-3 mb-6">
          {projectData.location_name || "Location not set"}
          {projectData.crs_label ? ` · ${projectData.crs_label}` : ""}
        </p>

        <dl className="mb-8 grid grid-cols-3 gap-2">
          <Stat value={String(surveys.length)} label="surveys" />
          <Stat value={stockpiles && stockpiles.surveyId === latestSurveyId ? String(stockpiles.count) : "-"} label="stockpiles" />
          <Stat value="-" label="open issues" />
        </dl>

        {failedHere.length > 0 && (
          <Alert
            tone="critical"
            title={failedHere.length === 1 ? "A survey failed to process" : `${failedHere.length} surveys failed to process`}
            className="mb-6"
            action={
              retryable.length > 0 ? (
                <Button variant="ghost" size="sm" loading={retrying} onClick={() => void retryAll()}>
                  Retry
                </Button>
              ) : undefined
            }
          >
            {failedHere.map((s) => (
              <span key={s.survey_id} className="block">
                {dateOf(s.survey_id)}: {failureTitle(s)}
              </span>
            ))}
          </Alert>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h3 className="h3">Surveys</h3>
          <Button asChild variant="primary" size="sm">
            <Link href={`/upload?site=${encodeURIComponent(projectId)}`}>
              <Icon icon={Upload01Icon} size={16} />
              Upload
            </Link>
          </Button>
        </div>

        {surveys.length === 0 ? (
          <EmptyState icon={SatelliteIcon} title="No surveys yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {surveys.map((survey) => (
              <li key={survey.id} className="flex items-center gap-1">
                <Link
                  href={`/viewer/${survey.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-md border border-hairline bg-surface-2 p-3 hover:border-hairline-strong hover:bg-surface-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-ink-4">
                    <Icon icon={SatelliteIcon} size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="small mb-1 block truncate font-medium text-ink-1">
                      <span className="num">{formatSurveyDate(survey.survey_date)}</span> · {survey.survey_type}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="num-sm text-ink-4">{survey.working_crs}</span>
                      <StateChip state={surveyState(survey.status)} />
                      {failedIds.has(survey.id) && <StateChip state={PROCESSING_FAILED} />}
                    </span>
                    {typeof survey.metadata?.sensor === "string" && <span className="caption mt-1 block text-ink-4">{survey.metadata.sensor}</span>}
                  </span>
                  <Icon icon={ArrowRight01Icon} size={16} className="ml-2 shrink-0 text-ink-4 group-hover:text-ink-2" />
                </Link>
                <IconButton
                  icon={PencilEdit02Icon}
                  aria-label={`Edit survey of ${formatSurveyDate(survey.survey_date)}`}
                  variant="bare"
                  size="sm"
                  onClick={() => setEditingId(survey.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <EditSurveyDrawer surveyId={editingId} onClose={() => setEditingId(null)} onChanged={() => setSurveysTick((t) => t + 1)} />

      <div className="flex items-center gap-4 border-t border-hairline p-6">
        <Button asChild variant="ghost">
          <Link href={`/reports?site=${encodeURIComponent(projectId)}`}>Reports</Link>
        </Button>
        {latestSurveyId ? (
          <Button asChild variant="primary" className="flex-1">
            <Link href={`/viewer/${latestSurveyId}`}>Open viewer</Link>
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" disabled>
            Open viewer
          </Button>
        )}
      </div>
    </aside>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-hairline bg-surface-2 p-2 text-center">
      <dd className="num text-ink-1">{value}</dd>
      <dt className="caption text-ink-4">{label}</dt>
    </div>
  );
}
