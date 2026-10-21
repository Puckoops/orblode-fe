"use client";

import { Add01Icon, ArrowRight01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { Button, EmptyState, Glyph, Icon, SearchInput, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { Stages } from "@/components/mm/common";
import { MMSitesHeader } from "@/components/mm/MMSitesHeader";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { getOverview, getRegister, type Overview, type RegisterRow } from "@/lib/api/mm";
import type { Project } from "@/lib/api/userSvc";
import { getWorkspaceOverview, listSurveys } from "@/lib/api/orblodeSvc";
import { useProcessing } from "@/lib/processing/store";
import { lifecycleState } from "@/lib/status";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import { formatSurveyDate } from "@/lib/utils";

interface SurveyStats {
  count: number;
  latestDate: string;
}

/** The site list beside the globe: filter, pick a site, or start a new one. `projects` is null while loading. In a
 * minor-minerals workspace each site shows its lease's stages, and the stages above filter the list. */
export function ActiveSitesPanel({
  projects,
  onSiteSelect,
  selectedSiteId,
}: {
  projects: Project[] | null;
  onSiteSelect: (id: string) => void;
  selectedSiteId: string;
}) {
  const failed = useProcessing((s) => s.failed);
  // Without a workspace to ask, the server decides when the site is made.
  const mayCreateSite = useCurrentWorkspace()?.can_create_project ?? true;
  const [surveyStats, setSurveyStats] = useState<Record<string, SurveyStats>>({});
  const [filter, setFilter] = useState("");
  const workspaceId = useWorkspaces((s) => s.currentId);
  const minorMinerals = useMinorMinerals();
  const [register, setRegister] = useState<RegisterRow[] | null>(null);
  const [attention, setAttention] = useState<Overview["attention"]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const leaseOf = (siteId: string) => register?.find((r) => r.lease.project_id === siteId);
  const newSite = minorMinerals ? { href: "/upload?create=lease", label: "New lease site" } : { href: "/upload?new=1", label: "New site" };

  const q = filter.trim().toLowerCase();
  const visibleProjects = projects
    ? projects.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (!stage || leaseOf(p.id)?.current_stage === stage))
    : null;

  useEffect(() => {
    if (!minorMinerals || !projects) return;
    let cancelled = false;
    Promise.all([getRegister().catch(() => [] as RegisterRow[]), getOverview().catch(() => null)]).then(([rows, overview]) => {
      if (cancelled) return;
      setRegister(rows);
      setAttention(overview?.attention ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [minorMinerals, projects]);

  useEffect(() => {
    // Stale entries are harmless: render only reads stats for projects in the list.
    if (!projects || projects.length === 0) return;
    let cancelled = false;

    const one = (id: string, count: number, date: string | undefined) => ({ id, count, latestDate: date ? formatSurveyDate(date) : "-" });
    // The workspace overview counts every project in one call; older services without it get a call per project.
    const fromOverview = workspaceId
      ? getWorkspaceOverview(workspaceId).then((overview) =>
          projects.map((project) => {
            const row = overview.projects.find((r) => r.project_id === project.id);
            return one(project.id, row?.surveys ?? 0, row?.latest_survey?.date);
          })
        )
      : Promise.reject(new Error("no workspace"));
    const perProject = () => Promise.all(
      projects.map(async (project) => {
        try {
          const { surveys = [] } = await listSurveys(project.id);
          const latest = [...surveys].sort((a, b) => new Date(b.survey_date).getTime() - new Date(a.survey_date).getTime())[0];
          return one(project.id, surveys.length, latest?.survey_date);
        } catch (err) {
          console.error(`Failed to fetch surveys for project ${project.id}:`, err);
          return one(project.id, 0, undefined);
        }
      }),
    );
    fromOverview.catch(perProject).then((results) => {
      if (!cancelled) setSurveyStats(Object.fromEntries(results.map((r) => [r.id, { count: r.count, latestDate: r.latestDate }])));
    });

    return () => {
      cancelled = true;
    };
  }, [projects, workspaceId]);

  return (
    <div className="flex h-full w-full flex-col bg-surface pt-4 pb-5">
      {minorMinerals && register && (
        <div className="mb-5">
          <MMSitesHeader rows={register} attention={attention} stage={stage} onStage={setStage} />
        </div>
      )}
      <div className="mb-5 px-5">
        <SearchInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter sites…" aria-label="Filter sites" />
      </div>

      <p className="caps text-4 mb-3 px-5">Active sites</p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1 px-3">
          {visibleProjects === null && (
            <li>
              <Loader label="Loading sites" />
            </li>
          )}
          {visibleProjects?.length === 0 && (
            <li>
              {q || stage ? (
                <EmptyState icon={Location01Icon} title="No sites match your filter." />
              ) : (
                <EmptyState
                  icon={Location01Icon}
                  title="No sites yet."
                  action={
                    mayCreateSite ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={newSite.href}>{newSite.label}</Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </li>
          )}
          {visibleProjects?.map((site) => {
            const selected = selectedSiteId === site.id;
            const state = lifecycleState(site.lifecycle_status);
            const stats = surveyStats[site.id];
            const failedCount = failed.filter((s) => s.project_id === site.id).length;
            const lease = minorMinerals && register ? leaseOf(site.id) : undefined;
            return (
              <li key={site.id}>
                <button
                  type="button"
                  onClick={() => onSiteSelect(site.id)}
                  aria-pressed={selected}
                  className={`group flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left ${
                    selected ? "border-hairline bg-emphasis-quiet" : "border-transparent hover:bg-surface-2"
                  }`}
                >
                  <span className="mt-0.5 text-ink-3" title={state.label}>
                    <Glyph shape={state.glyph} aria-label={state.label} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <span className={`small truncate font-medium ${selected ? "text-ink-1" : "text-ink-2 group-hover:text-ink-1"}`}>{site.name}</span>
                      <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-ink-4" />
                    </span>
                    {stats ? (
                      <span className="num-sm text-ink-4">
                        {stats.count} surveys · {stats.latestDate}
                        {failedCount > 0 && <span className="whitespace-nowrap text-ink-2"> · {failedCount} failed</span>}
                      </span>
                    ) : (
                      <Skeleton width={120} height={12} />
                    )}
                    {minorMinerals && register && (
                      <span className="mt-1.5 flex items-center gap-2">
                        {lease ? (
                          <>
                            <Stages stages={lease.stages} />
                            <span className="caption truncate text-ink-3">{lease.state_label}</span>
                          </>
                        ) : (
                          <span className="caption text-ink-4">No lease yet</span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {mayCreateSite && (
        <div className="mt-4 px-5">
          <Button asChild variant="quiet" className="w-full">
            <Link href={newSite.href}>
              <Icon icon={Add01Icon} size={16} />
              {newSite.label}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
