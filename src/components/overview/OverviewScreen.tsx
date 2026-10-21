"use client";

import { Add01Icon, Location01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Chip, EmptyState, FigureCard, Page, PageHeader, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { NoWorkspace } from "@/components/workspaces/NoWorkspace";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { getWorkspaceOverview, type WorkspaceOverview } from "@/lib/api/orblodeSvc";
import { useInbox } from "@/lib/notifications/store";
import { attentionItems, surveyedWithin, type AttentionTone } from "@/lib/overview/summary";
import { useProcessing } from "@/lib/processing/store";
import { formatCubic, formatTonnes, formatValue } from "@/lib/reports";
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

const ACTIVITY_SHOWN = 8;
const RECENT_DAYS = 30;

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
            <FigureCard
              label="Surveys"
              value={totals ? totals.surveys : NaN}
              format={orDash(String)}
              caption={latest ? `latest ${formatSurveyDate(latest)}` : undefined}
            />
            <FigureCard
              label="Stock on hand"
              value={totals ? (byWeight ? totals.tonnage_t : totals.volume_m3) : NaN}
              format={orDash(byWeight ? formatTonnes : formatCubic)}
              caption={
                totals && totals.piles > 0
                  ? byWeight
                    ? [formatCubic(totals.volume_m3), totals.value > 0 ? formatValue(totals.value) : ""].filter(Boolean).join(" · ")
                    : "no tonnage: the piles have no material"
                  : totals
                    ? "no stockpiles yet"
                    : undefined
              }
            />
            <FigureCard label="Processing" value={running.length} caption={failed.length ? `${failed.length} failed` : "nothing failed"} />
          </div>
          {overview === null && <p className="caption mt-3 text-ink-4">The project figures couldn’t load. Reload the page to try again.</p>}

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
                      <Td>{row?.latest_survey ? formatSurveyDate(row.latest_survey.date) : "–"}</Td>
                      <Td numeric>{row?.stock ? (row.stock.tonnage_t > 0 ? formatTonnes(row.stock.tonnage_t) : formatCubic(row.stock.volume_m3)) : "–"}</Td>
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
