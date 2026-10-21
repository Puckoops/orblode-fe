"use client";

import { Add01Icon, Location01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Chip, EmptyState, FigureCard, Page, PageHeader, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { NoWorkspace } from "@/components/workspaces/NoWorkspace";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { getSurveyProcessing, getWorkspaceOverview, type ProcessingRun, type WorkspaceOverview } from "@/lib/api/orblodeSvc";
import { useInbox } from "@/lib/notifications/store";
import { attentionItems, freshnessOf, stockAsOf, surveyedWithin, type AttentionTone, type Freshness } from "@/lib/overview/summary";
import { useProcessing } from "@/lib/processing/store";
import { runStatus } from "@/lib/processing/summary";
import { formatCubic, formatDelta, formatTonnes, formatValue } from "@/lib/reports";
import { useSiteAlerts } from "@/lib/reports/alerts";
import { lifecycleState, PROCESSING, PROCESSING_FAILED } from "@/lib/status";
import { clockTime, shortDate } from "@/lib/time";
import { formatSurveyDate } from "@/lib/utils";
import { inSites } from "@/lib/workspaces/pick";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";

const TONE = {
  bad: { tone: "red", glyph: "cross", label: "Action" },
  warn: { tone: "amber", glyph: "triangle", label: "Soon" },
  info: { tone: "blue", glyph: "circle-half", label: "Note" },
} as const satisfies Record<AttentionTone, { tone: string; glyph: string; label: string }>;

const FRESHNESS = {
  recent: { tone: "teal", glyph: "check", label: "Recent" },
  due: { tone: "amber", glyph: "triangle", label: "Due" },
  dormant: { tone: "neutral", glyph: "circle-dashed", label: "Dormant" },
} as const satisfies Record<Freshness, { tone: string; glyph: string; label: string }>;

const ACTIVITY_SHOWN = 8;
const RECENT_DAYS = 30;
const RUNNING_SHOWN = 6;
const RUNS_POLL_MS = 15_000;

const orDash = (format: (v: number) => string) => (v: number) => (Number.isNaN(v) ? "–" : format(v));

/** The open workspace at a glance, the same for every kind of workspace: its projects, surveys and stock, what is
 * processing, what needs someone, and what happened lately. */
export function OverviewScreen() {
  const workspace = useCurrentWorkspace();
  const workspaceId = useWorkspaces((s) => s.currentId);
  const sites = useWorkspaces((s) => s.sites);
  const noWorkspace = useWorkspaces((s) => s.workspaces?.length === 0 && !s.unavailable);
  const minorMinerals = useMinorMinerals();
  const failedAll = useProcessing((s) => s.failed);
  const runningAll = useProcessing((s) => s.running);
  const alertsAll = useSiteAlerts((s) => s.sites);
  const notices = useInbox((s) => s.items);
  const [now] = useState(() => Date.now());
  const [loaded, setLoaded] = useState<{ workspaceId: string; overview: WorkspaceOverview | null } | null>(null);
  const [runs, setRuns] = useState<Record<string, ProcessingRun[]>>({});

  useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    getWorkspaceOverview(workspaceId)
      .then((overview) => live && setLoaded({ workspaceId, overview }))
      .catch((err) => {
        console.error("Failed to fetch the overview:", err);
        if (live) setLoaded({ workspaceId, overview: null });
      });
    return () => {
      live = false;
    };
  }, [workspaceId]);

  const overview = loaded?.workspaceId === workspaceId ? loaded.overview : undefined;
  const failed = useMemo(() => inSites(failedAll, sites), [failedAll, sites]);
  const running = useMemo(() => inSites(runningAll, sites), [runningAll, sites]);
  const alerts = useMemo(() => inSites(alertsAll, sites), [alertsAll, sites]);
  const runningKey = running.slice(0, RUNNING_SHOWN).map((r) => r.survey_id).join(",");

  // The rail's store says which surveys are processing; how far each has got is the survey's own processing.
  useEffect(() => {
    if (!runningKey) return;
    let live = true;
    const ids = runningKey.split(",");
    const read = () =>
      Promise.all(ids.map((id) => getSurveyProcessing(id).then((p) => [id, p.running ?? []] as const).catch(() => [id, []] as const))).then(
        (pairs) => live && setRuns(Object.fromEntries(pairs))
      );
    void read();
    const timer = window.setInterval(() => void read(), RUNS_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [runningKey]);
  const today = new Date(now).toISOString().slice(0, 10);
  const attention = useMemo(
    () => attentionItems({ failed, alerts, projects: overview?.projects ?? [] }, today),
    [failed, alerts, overview, today]
  );
  const activity = useMemo(() => {
    const ids = new Set((sites ?? []).map((s) => s.id));
    return notices.filter((n) => n.project_id && ids.has(n.project_id)).slice(0, ACTIVITY_SHOWN);
  }, [notices, sites]);

  if (noWorkspace) return <NoWorkspace className="px-5 pt-10" />;

  const nameOf = (id: string) => sites?.find((s) => s.id === id)?.name ?? "A project";
  const rowOf = (id: string) => overview?.projects.find((p) => p.project_id === id);
  const latest = overview?.projects.map((p) => p.latest_survey?.date).filter((d): d is string => !!d).sort().at(-1);
  const totals = overview?.totals;
  // Piles weigh only once they have a material; until then the volume is all there is.
  const byWeight = !totals || totals.tonnage_t > 0 || totals.volume_m3 === 0;
  const asOf = overview ? stockAsOf(overview.projects) : null;
  const stockDelta = totals ? (byWeight ? totals.delta_tonnage_t : totals.delta_volume_m3) : null;
  const materials = overview?.materials ?? [];
  const mayCreate = workspace?.can_create_project ?? true;
  const newProject = minorMinerals ? "/upload?create=lease" : "/upload?new=1";

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title={workspace?.name ?? "Overview"}
        subtitle="Your projects, surveys and stock at a glance"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost" iconStart={Upload01Icon}>
              <Link href="/upload">Upload</Link>
            </Button>
            {mayCreate && (
              <Button asChild variant="primary" iconStart={Add01Icon}>
                <Link href={newProject}>New project</Link>
              </Button>
            )}
          </div>
        }
      />

      {sites === null ? (
        <Skeleton height={320} />
      ) : sites.length === 0 ? (
        <EmptyState
          framed
          icon={Location01Icon}
          title="No projects yet."
          description="A project holds a place's surveys, measurements and reports."
          action={
            mayCreate ? (
              <Button asChild variant="ghost">
                <Link href={newProject}>New project</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FigureCard
              label="Projects"
              value={sites.length}
              hero
              caption={overview ? `${surveyedWithin(overview.projects, RECENT_DAYS)} surveyed in the last ${RECENT_DAYS} days` : undefined}
            />
            {/* Kpi animates from its last value, and from NaN it never arrives: remount once the value is known. */}
            <FigureCard
              key={totals ? "surveys" : "surveys-pending"}
              label="Surveys"
              value={totals ? totals.surveys : NaN}
              format={orDash(String)}
              caption={latest ? `latest ${formatSurveyDate(latest)}` : undefined}
            />
            <FigureCard
              key={totals ? (byWeight ? "stock-t" : "stock-m3") : "stock-pending"}
              label="Stock on hand"
              value={totals ? (byWeight ? totals.tonnage_t : totals.volume_m3) : NaN}
              format={orDash(byWeight ? formatTonnes : formatCubic)}
              delta={stockDelta != null ? formatDelta(stockDelta, byWeight ? "t" : "m³") : undefined}
              caption={
                totals && totals.piles > 0
                  ? [
                      byWeight ? formatCubic(totals.volume_m3) : "no tonnage: the piles have no material",
                      byWeight && totals.value > 0 ? formatValue(totals.value) : "",
                      asOf ? `as of ${formatSurveyDate(asOf)}` : "from each project's latest stockpile survey",
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : totals
                    ? "no stockpiles yet"
                    : undefined
              }
            />
            <FigureCard label="Processing" value={running.length} caption={failed.length ? `${failed.length} failed` : "nothing failed"} />
          </div>
          {overview === null && <p className="caption mt-3 text-ink-4">The project figures couldn’t load. Reload the page to try again.</p>}

          {running.length > 0 && (
            <Band heading="Processing now" caption={running.length > RUNNING_SHOWN ? `The first ${RUNNING_SHOWN} of ${running.length}.` : undefined}>
              <ul className="flex flex-col divide-y divide-hairline">
                {running.slice(0, RUNNING_SHOWN).map((r) => (
                  <li key={r.survey_id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                    <Link href={`/projects?site=${encodeURIComponent(r.project_id)}`} className="small font-medium text-ink-1 hover:underline">
                      {nameOf(r.project_id)}
                    </Link>
                    <span className="flex flex-col items-end gap-0.5">
                      {(runs[r.survey_id] ?? []).length === 0 ? (
                        <span className="caption text-ink-4">{r.open === 1 ? "1 run" : `${r.open} runs`} going</span>
                      ) : (
                        runs[r.survey_id].map((run) => (
                          <span key={run.workflow_id} className="caption text-ink-3">
                            {run.label} · {runStatus(run)}
                          </span>
                        ))
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Band>
          )}

          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <Band heading="Needs attention">
              {overview === undefined ? (
                <Skeleton height={120} />
              ) : attention.length === 0 ? (
                <p className="small text-ink-4">Nothing needs anyone right now.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {attention.map((a) => (
                    <li key={a.key} className="flex items-start justify-between gap-3 py-2">
                      <Link href={a.href} className="small min-w-0 hover:underline">
                        <span className="block truncate font-medium text-ink-1">{nameOf(a.projectId)}</span>
                        <span className="caption block text-ink-3">{a.text}</span>
                      </Link>
                      <Chip tone={TONE[a.tone].tone} glyph={TONE[a.tone].glyph}>
                        {TONE[a.tone].label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Band>
            <Band heading="Recent activity">
              {activity.length === 0 ? (
                <p className="small text-ink-4">Nothing yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {activity.map((n) => (
                    <li key={n.id} className="flex gap-3 py-2">
                      <time className="caption w-24 shrink-0 text-ink-4">
                        {shortDate(n.created_at, now)} {clockTime(n.created_at)}
                      </time>
                      <span className="min-w-0">
                        {n.link ? (
                          <Link href={n.link} className="small block text-ink-2 hover:underline">
                            {n.title}
                          </Link>
                        ) : (
                          <span className="small block text-ink-2">{n.title}</span>
                        )}
                        {n.project_id && <span className="caption block text-ink-4">{nameOf(n.project_id)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Band>
          </div>

          {materials.length > 0 && (
            <Band heading="Stock by material" caption="Each project's latest stockpile survey, with materials of the same name added up.">
              <Table minWidth={560}>
                <THead>
                  <Tr>
                    <Th>Material</Th>
                    <Th numeric>Projects</Th>
                    <Th numeric>Piles</Th>
                    <Th numeric>Tonnes</Th>
                    <Th numeric>Volume</Th>
                    <Th numeric>Value</Th>
                  </Tr>
                </THead>
                <TBody>
                  {materials.map((m) => (
                    <Tr key={m.name || "-"}>
                      <Td primary>{m.name || <span className="text-ink-4">No material</span>}</Td>
                      <Td numeric>{m.projects}</Td>
                      <Td numeric>{m.piles}</Td>
                      <Td numeric>{m.tonnage_t > 0 ? formatTonnes(m.tonnage_t) : "–"}</Td>
                      <Td numeric>{formatCubic(m.volume_m3)}</Td>
                      <Td numeric>{m.value > 0 ? formatValue(m.value) : "–"}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Band>
          )}

          <Band heading="Projects">
            <Table minWidth={760}>
              <THead>
                <Tr>
                  <Th>Project</Th>
                  <Th>Status</Th>
                  <Th numeric>Surveys</Th>
                  <Th>Latest survey</Th>
                  <Th numeric>Stock</Th>
                  <Th>Runs out</Th>
                  <Th>
                    <span className="visually-hidden">Processing</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {sites.map((site) => {
                  const row = rowOf(site.id);
                  const processing = running.some((r) => r.project_id === site.id);
                  const broken = failed.some((f) => f.project_id === site.id);
                  const freshness = row ? freshnessOf(row.days_since_survey) : null;
                  const stock = row?.stock;
                  const weighed = !!stock && stock.tonnage_t > 0;
                  const change = stock ? (weighed ? stock.delta_tonnage_t : stock.delta_volume_m3) : null;
                  return (
                    <Tr key={site.id}>
                      <Td primary>
                        <Link href={`/projects?site=${encodeURIComponent(site.id)}`} className="hover:underline">
                          {site.name}
                        </Link>
                        {site.location_name && <span className="caption block text-ink-4">{site.location_name}</span>}
                      </Td>
                      <Td>
                        <StateChip state={lifecycleState(site.lifecycle_status)} />
                      </Td>
                      <Td numeric>{row ? row.surveys : "–"}</Td>
                      <Td>
                        {row?.latest_survey ? (
                          <span className="flex flex-wrap items-center gap-2">
                            {formatSurveyDate(row.latest_survey.date)}
                            {freshness && (
                              <Chip tone={FRESHNESS[freshness].tone} glyph={FRESHNESS[freshness].glyph}>
                                {FRESHNESS[freshness].label}
                              </Chip>
                            )}
                          </span>
                        ) : (
                          "–"
                        )}
                      </Td>
                      <Td numeric>
                        {stock ? (
                          <>
                            {weighed ? formatTonnes(stock.tonnage_t) : formatCubic(stock.volume_m3)}
                            <span className="caption block text-ink-4">
                              {change != null && stock.previous_survey
                                ? `${formatDelta(change, weighed ? "t" : "m³")} since ${formatSurveyDate(stock.previous_survey.date)}`
                                : `as of ${formatSurveyDate(stock.survey.date)}`}
                            </span>
                          </>
                        ) : (
                          "–"
                        )}
                      </Td>
                      <Td>{row?.next_depletion ? `${row.next_depletion.material}, ${formatSurveyDate(row.next_depletion.date)}` : "–"}</Td>
                      <Td>{broken ? <StateChip state={PROCESSING_FAILED} /> : processing ? <StateChip state={PROCESSING} /> : null}</Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </Band>
        </>
      )}
    </Page>
  );
}
