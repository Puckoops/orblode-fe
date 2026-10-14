"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Alert, Badge, IconButton, Select } from "@puckoops/camelot";
import { Loader } from "@/components/brand/Loader";
import { EditSurveyDrawer } from "@/components/survey/EditSurveyDrawer";
import { listSurveys, type Survey } from "@/lib/api/orblodeSvc";
import { formatSurveyDate } from "@/lib/utils";

/** Sibling surveys for the same project: a current-survey selector plus a
 * chronological list with version chips and status badges. `refreshKey`
 * refetches the list; `onSurveyChanged` runs after a survey is edited here. */
export function SurveyList({
  projectId,
  currentSurveyId,
  refreshKey,
  onSurveyChanged,
}: {
  projectId: string;
  currentSurveyId: string;
  refreshKey?: number;
  onSurveyChanged?: (surveyId: string) => void;
}) {
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Reset to the loading state the moment projectId changes, so switching
  // projects never briefly shows the previous list or a stale error. Done as a
  // render-phase adjustment (React's documented pattern) rather than in the
  // effect, which would trigger a cascading-render lint error.
  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  if (loadedProjectId !== projectId) {
    setLoadedProjectId(projectId);
    setSurveys(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    listSurveys(projectId)
      .then((res) => {
        if (cancelled) return;
        const list = (res.surveys || [])
          .slice()
          .sort((a, b) => b.survey_date.localeCompare(a.survey_date));
        setSurveys(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load surveys");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, reloadTick]);

  const versionOf = useMemo(() => {
    const map = new Map<string, number>();
    if (surveys) {
      for (const s of surveys) {
        map.set(s.id, s.version_number && s.version_number > 0 ? s.version_number : 1);
      }
    }
    return map;
  }, [surveys]);

  if (error) {
    return (
      <Alert tone="critical" title="Surveys couldn't load" className="m-3">
        {error}
      </Alert>
    );
  }
  if (!surveys) {
    return (
      <Loader label="Loading surveys" />
    );
  }
  if (surveys.length === 0) {
    return <p className="caption px-3 py-2 text-ink-4">This project has no surveys yet.</p>;
  }

  const label = (s: Survey) => `Survey V${versionOf.get(s.id)} · ${formatSurveyDate(s.survey_date)}`;

  return (
    <div className="flex flex-col px-3 pt-3">
      <Select
        aria-label="Current survey"
        value={currentSurveyId}
        onValueChange={(id) => {
          if (id !== currentSurveyId) router.push(`/viewer/${id}`);
        }}
        placeholder="Select survey"
        options={surveys.map((s) => ({ value: s.id, label: label(s) }))}
      />

      <p className="caps px-1 pt-4 pb-1.5 text-ink-4">All surveys</p>

      <ul className="flex flex-col gap-1">
        {surveys.map((s) => {
          const active = s.id === currentSurveyId;
          return (
            <li key={s.id} className="relative">
              <Link
                href={`/viewer/${s.id}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => active && e.preventDefault()}
                className={`flex flex-col gap-1.5 rounded-md border px-3 py-2.5 ${
                  active ? "border-hairline-strong bg-emphasis-quiet" : "border-transparent hover:border-hairline hover:bg-surface-2"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="num truncate font-medium text-ink-1">{formatSurveyDate(s.survey_date)}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="tag">V{versionOf.get(s.id)}</Badge>
                  </span>
                </span>
                <span className="caption pr-8 text-ink-4">{s.survey_type}</span>
              </Link>
              <IconButton
                icon={PencilEdit02Icon}
                aria-label={`Edit survey of ${formatSurveyDate(s.survey_date)}`}
                variant="bare"
                size="sm"
                className="absolute right-1.5 bottom-1"
                onClick={() => setEditingId(s.id)}
              />
            </li>
          );
        })}
      </ul>

      <EditSurveyDrawer
        surveyId={editingId}
        onClose={() => setEditingId(null)}
        onChanged={(id) => {
          setReloadTick((t) => t + 1);
          onSurveyChanged?.(id);
        }}
      />
    </div>
  );
}
