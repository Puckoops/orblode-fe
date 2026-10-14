"use client";

import { ArrowDown01Icon, BlueprintIcon, File01Icon, Folder01Icon, RefreshIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Alert, Band, Button, EmptyState, Icon, IconButton, Page, PageHeader, SearchInput, TextLink } from "@puckoops/camelot";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Loader } from "@/components/brand/Loader";
import { listDesigns, listSurveyAssets, listSurveys, type DesignRecord, type SourceAsset } from "@/lib/api/orblodeSvc";
import { listOrgMembers } from "@/lib/api/userSvc";
import { assetName } from "@/lib/survey/edit";
import { assetFolders, totalBytes } from "@/lib/survey/folders";
import { formatSurveyDate } from "@/lib/utils";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import { Files, Folders, ViewToggle, fileCount } from "./FileParts";
import { FolderView } from "./FolderView";
import { useCollapsed } from "./collapsed";
import { PeopleProvider, peopleById } from "./people";
import {
  FOLDER_ICONS,
  assetEntry,
  designEntry,
  designsFolderHref,
  nameMatches,
  openFolderFrom,
  siteAnchor,
  surveyAnchor,
  surveyFolderHref,
  type FileEntry,
  type SiteGroup,
  type SurveyGroup,
} from "./tree";
import { useViewMode, type ViewMode } from "./viewMode";

// Every uploaded source object in the current workspace: site → survey → one folder per asset type, plus
// each site's registered designs in a folder of their own.
// Downloads go through /files/<key>?download=1, which orblode-svc answers with a short-lived signed link.

export function FilesScreen() {
  const workspaceSites = useWorkspaces((s) => s.sites);
  const workspace = useCurrentWorkspace();
  const open = openFolderFrom(useSearchParams());
  const [sites, setSites] = useState<SiteGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");
  const [view, setView] = useViewMode();
  const [people, setPeople] = useState(() => peopleById([]));

  // Another workspace's sites start a fresh load; the refresh button resets in its click handler. Either
  // way the effect only fetches.
  const [loadedFor, setLoadedFor] = useState(workspaceSites);
  if (loadedFor !== workspaceSites) {
    setLoadedFor(workspaceSites);
    setSites(null);
    setLoadError(null);
  }

  useEffect(() => {
    if (!workspaceSites) return;
    let cancelled = false;

    (async () => {
      const projects = workspaceSites;
      // One failing project, survey or design list degrades to an empty list rather than killing the page.
      const groups = await Promise.all(
        projects.map(async (project): Promise<SiteGroup> => {
          const [surveyGroups, designs] = await Promise.all([
            listSurveys(project.id)
              .then(async ({ surveys }) => {
                const sorted = [...(surveys || [])].sort((a, b) => b.survey_date.localeCompare(a.survey_date));
                return Promise.all(
                  sorted.map(async (survey): Promise<SurveyGroup> => {
                    const { assets } = await listSurveyAssets(survey.id).catch(() => ({ assets: [] as SourceAsset[] }));
                    return { survey, assets: assets || [] };
                  }),
                );
              })
              .catch(() => [] as SurveyGroup[]),
            listDesigns(project.id)
              .then((r) => r.designs || [])
              .catch(() => [] as DesignRecord[]),
          ]);
          return { project, surveys: surveyGroups, designs };
        }),
      );
      if (!cancelled) setSites(groups);
    })().catch((err) => {
      console.error("Failed to load files:", err);
      if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load files");
    });

    return () => {
      cancelled = true;
    };
  }, [refreshTick, workspaceSites]);

  useEffect(() => {
    let cancelled = false;
    listOrgMembers()
      .then((members) => {
        if (!cancelled) setPeople(peopleById(members));
      })
      // Without the people list each file still names its uploader by the email its record kept.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const refresh = () => {
    setSites(null);
    setLoadError(null);
    setRefreshTick((t) => t + 1);
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!sites) return null;
    return sites
      .map((s) => ({
        ...s,
        surveys: s.surveys.map((sg) => ({ ...sg, assets: sg.assets.filter((a) => nameMatches(assetName(a), q)) })).filter((sg) => sg.assets.length > 0),
        designs: s.designs.filter((d) => nameMatches(d.name, q)),
      }))
      .filter((s) => s.surveys.length > 0 || s.designs.length > 0);
  }, [sites, q]);

  const totals = useMemo(() => {
    if (!visible) return { files: 0, designs: 0 };
    let files = 0;
    let designs = 0;
    for (const s of visible) {
      designs += s.designs.length;
      for (const sg of s.surveys) files += sg.assets.length;
    }
    return { files, designs };
  }, [visible]);

  const loading = sites === null && !loadError;

  const toolbar = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={open ? "Search this folder…" : "Search files by name…"}
          aria-label={open ? "Search this folder" : "Search files by name"}
        />
      </div>
      <ViewToggle value={view} onChange={setView} />
    </div>
  );

  if (open) {
    return (
      <PeopleProvider value={people}>
        <FolderView open={open} sites={sites} loadError={loadError} query={q} toolbar={toolbar} view={view} onRefresh={refresh} />
      </PeopleProvider>
    );
  }

  return (
    <PeopleProvider value={people}>
      <Page>
        <PageHeader
          title="Outputs"
          subtitle={
            loading
              ? "Loading uploaded source data…"
              : `${totals.files} uploaded file${totals.files === 1 ? "" : "s"}${
                  totals.designs ? ` · ${totals.designs} design${totals.designs === 1 ? "" : "s"}` : ""
                } across ${workspace ? `the sites in ${workspace.name}` : "your sites"}`
          }
          actions={<IconButton icon={RefreshIcon} aria-label="Refresh" disabled={loading} onClick={refresh} />}
        />

        <div className="flex max-w-3xl flex-col gap-8">
          {toolbar}

          {loadError ? (
            <Alert tone="critical" title="Files couldn't load">
              {loadError}
            </Alert>
          ) : visible === null ? (
            <Loader label="Loading files" />
          ) : visible.length === 0 ? (
            q ? (
              <EmptyState icon={File01Icon} title="No files match your search." framed />
            ) : (
              <EmptyState
                icon={File01Icon}
                title="Nothing has been uploaded yet."
                framed
                action={
                  <Button asChild variant="ghost">
                    <Link href="/upload">
                      <Icon icon={Upload01Icon} size={16} />
                      Upload data
                    </Link>
                  </Button>
                }
              />
            )
          ) : q ? (
            <SearchResults sites={visible} view={view} />
          ) : (
            visible.map((site) => <SiteSection key={site.project.id} site={site} view={view} />)
          )}
        </div>
      </Page>
    </PeopleProvider>
  );
}

const surveyCardKey = (surveyId: string) => `survey:${surveyId}`;
const designsCardKey = (siteId: string) => `designs:${siteId}`;

function SiteSection({ site, view }: { site: SiteGroup; view: ViewMode }) {
  const [collapsed, setCollapsed] = useCollapsed();
  const keys = [...site.surveys.map((sg) => surveyCardKey(sg.survey.id)), ...(site.designs.length > 0 ? [designsCardKey(site.project.id)] : [])];
  const allCollapsed = keys.every((k) => collapsed.has(k));
  const toggle = (key: string) => setCollapsed([key], !collapsed.has(key));

  return (
    <Band
      id={siteAnchor(site.project.id)}
      heading={site.project.name}
      first
      className="scroll-mt-32"
      actions={
        keys.length > 1 && (
          <Button variant="quiet" size="sm" onClick={() => setCollapsed(keys, !allCollapsed)}>
            {allCollapsed ? "Expand all" : "Collapse all"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {site.surveys.map((sg) => {
          const key = surveyCardKey(sg.survey.id);
          return <SurveyCard key={sg.survey.id} group={sg} view={view} collapsed={collapsed.has(key)} onToggle={() => toggle(key)} />;
        })}
        {site.designs.length > 0 && (
          <FolderCard
            title="Site designs"
            caption="Registered for the whole site"
            collapsed={collapsed.has(designsCardKey(site.project.id))}
            onToggle={() => toggle(designsCardKey(site.project.id))}
          >
            <Folders
              view={view}
              folders={[{ key: "designs", href: designsFolderHref(site.project.id), label: "Designs", type: BlueprintIcon, count: site.designs.length, bytes: 0 }]}
            />
          </FolderCard>
        )}
      </div>
    </Band>
  );
}

function SurveyCard({ group, view, collapsed, onToggle }: { group: SurveyGroup; view: ViewMode; collapsed: boolean; onToggle: () => void }) {
  const { survey, assets } = group;
  const folders = assetFolders(assets);
  return (
    <FolderCard
      id={surveyAnchor(survey.id)}
      title={<span className="num">{formatSurveyDate(survey.survey_date)}</span>}
      caption={`${survey.survey_type || "survey"} · ${folders.length} folder${folders.length === 1 ? "" : "s"} · ${fileCount(assets.length)}`}
      collapsed={collapsed}
      onToggle={onToggle}
      action={
        <TextLink as={Link} href={`/viewer/${survey.id}`} arrow="forward" className="caption">
          Open in viewer
        </TextLink>
      }
    >
      <Folders
        view={view}
        folders={folders.map((f) => ({
          key: f.key,
          href: surveyFolderHref(survey.id, f.key),
          label: f.label,
          type: FOLDER_ICONS[f.key],
          count: f.assets.length,
          bytes: totalBytes(f.assets),
        }))}
      />
    </FolderCard>
  );
}

function FolderCard({
  id,
  title,
  caption,
  action,
  collapsed,
  onToggle,
  children,
}: {
  id?: string;
  title: ReactNode;
  caption: ReactNode;
  action?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section id={id} className="scroll-mt-32 overflow-hidden rounded-md border border-hairline bg-surface">
      <header className={`flex items-center gap-2 py-1.5 pr-4 pl-1.5 ${collapsed ? "" : "border-b border-hairline"}`}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
        >
          <Icon icon={ArrowDown01Icon} size={16} className={`shrink-0 text-ink-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="small font-medium whitespace-nowrap text-ink-1">{title}</span>
            <span className="caption min-w-0 truncate text-ink-4">{caption}</span>
          </span>
        </button>
        {action && <span className="shrink-0">{action}</span>}
      </header>
      <div id={bodyId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

interface Match {
  key: string;
  href: string;
  path: string;
  entries: FileEntry[];
}

/** Matching files listed under the folder that holds them, so a search needs no clicking through. */
function SearchResults({ sites, view }: { sites: SiteGroup[]; view: ViewMode }) {
  const matches: Match[] = sites.flatMap((site) => [
    ...site.surveys.flatMap((sg) =>
      assetFolders(sg.assets).map((f) => ({
        key: `${sg.survey.id}/${f.key}`,
        href: surveyFolderHref(sg.survey.id, f.key),
        path: [site.project.name, formatSurveyDate(sg.survey.survey_date), f.label].join(" / "),
        entries: f.assets.map(assetEntry),
      })),
    ),
    ...(site.designs.length > 0
      ? [{ key: `${site.project.id}/designs`, href: designsFolderHref(site.project.id), path: `${site.project.name} / Designs`, entries: site.designs.map(designEntry) }]
      : []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {matches.map((m) => (
        <section key={m.key}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <Icon icon={Folder01Icon} size={14} className="shrink-0 text-ink-4" />
            <TextLink as={Link} href={m.href} className="small min-w-0 truncate">
              {m.path}
            </TextLink>
            <span className="caption shrink-0 text-ink-4">
              {m.entries.length} match{m.entries.length === 1 ? "" : "es"}
            </span>
          </div>
          <Files entries={m.entries} view={view} />
        </section>
      ))}
    </div>
  );
}
