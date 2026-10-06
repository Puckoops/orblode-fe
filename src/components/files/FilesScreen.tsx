"use client";

import {
  CubeIcon,
  Download01Icon,
  File01Icon,
  FileZipIcon,
  Image01Icon,
  Link04Icon,
  MapsIcon,
  MountainIcon,
  RefreshIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { Alert, Badge, Band, Button, EmptyState, Icon, IconButton, Page, PageHeader, SearchInput, Skeleton, TextLink, toast, type IconDefinition } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { listProjects, type Project } from "@/lib/api/userSvc";
import { listDesigns, listSurveyAssets, listSurveys, type DesignRecord, type SourceAsset, type Survey } from "@/lib/api/orblodeSvc";
import { canonicalUrl, downloadUrl } from "@/lib/files";
import { PENDING_UPLOAD } from "@/lib/status";
import { formatSurveyDate } from "@/lib/utils";

// Every uploaded source object, grouped by site → survey, plus each site's registered designs.
// Downloads go through /files/<key>?download=1, which orblode-svc answers with a short-lived signed link.

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function fileIcon(filename: string): IconDefinition {
  switch (ext(filename)) {
    case "jpg":
    case "jpeg":
    case "png":
      return Image01Icon;
    case "tif":
    case "tiff":
      return MountainIcon;
    case "las":
    case "laz":
      return CubeIcon;
    case "dxf":
    case "shp":
    case "geojson":
    case "json":
    case "xml":
      return MapsIcon;
    case "zip":
      return FileZipIcon;
    default:
      return File01Icon;
  }
}

function formatBytes(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("File URL copied");
  } catch {
    toast.error("Could not copy URL");
  }
}

interface SurveyGroup {
  survey: Survey;
  assets: SourceAsset[];
}

interface SiteGroup {
  project: Project;
  surveys: SurveyGroup[];
  designs: DesignRecord[];
}

export function FilesScreen() {
  const [sites, setSites] = useState<SiteGroup[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");

  // The refresh button resets to loading in its click handler before bumping refreshTick, so the effect only fetches.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const projects = await listProjects();
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
  }, [refreshTick]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!sites) return null;
    return sites
      .map((s) => ({
        ...s,
        surveys: s.surveys
          .map((sg) => ({ ...sg, assets: q ? sg.assets.filter((a) => (a.filename || a.url).toLowerCase().includes(q)) : sg.assets }))
          .filter((sg) => sg.assets.length > 0),
        designs: q ? s.designs.filter((d) => d.name.toLowerCase().includes(q)) : s.designs,
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

  return (
    <Page>
      <PageHeader
        title="Files"
        subtitle={
          loading
            ? "Loading uploaded source data…"
            : `${totals.files} uploaded file${totals.files === 1 ? "" : "s"}${
                totals.designs ? ` · ${totals.designs} design${totals.designs === 1 ? "" : "s"}` : ""
              } across your sites`
        }
        actions={
          <IconButton
            icon={RefreshIcon}
            aria-label="Refresh"
            disabled={loading}
            onClick={() => {
              setSites(null);
              setLoadError(null);
              setRefreshTick((t) => t + 1);
            }}
          />
        }
      />

      <div className="flex max-w-3xl flex-col gap-8">
        <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files by name…" aria-label="Search files by name" />

        {loadError ? (
          <Alert tone="critical" title="Files couldn't load">
            {loadError}
          </Alert>
        ) : visible === null ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton width={180} height={20} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={56} radius="var(--radius-md)" />
            ))}
          </div>
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
        ) : (
          visible.map((site) => <SiteSection key={site.project.id} site={site} />)
        )}
      </div>
    </Page>
  );
}

function SiteSection({ site }: { site: SiteGroup }) {
  return (
    <Band heading={site.project.name} first>
      <div className="flex flex-col gap-4">
        {site.surveys.map((sg) => (
          <div key={sg.survey.id}>
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="num text-ink-2">{formatSurveyDate(sg.survey.survey_date)}</span>
              <span className="caption text-ink-4">
                {sg.survey.survey_type || "survey"} · {sg.assets.length} file{sg.assets.length === 1 ? "" : "s"}
              </span>
              <TextLink as={Link} href={`/viewer/${sg.survey.id}`} arrow="forward" className="caption ml-auto">
                Open in viewer
              </TextLink>
            </div>
            <ul className="overflow-hidden rounded-md border border-hairline bg-surface">
              {sg.assets.map((a, i) => (
                <FileRow
                  key={a.id}
                  name={a.filename || a.url.split("/").pop() || a.id}
                  tag={a.role || a.kind}
                  pending={a.status === "pending_upload"}
                  sizeBytes={a.size_bytes}
                  crs={a.crs}
                  url={a.url}
                  last={i === sg.assets.length - 1}
                />
              ))}
            </ul>
          </div>
        ))}

        {site.designs.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="small font-medium text-ink-2">Designs</span>
              <span className="caption text-ink-4">
                · {site.designs.length} file{site.designs.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="overflow-hidden rounded-md border border-hairline bg-surface">
              {site.designs.map((d, i) => (
                <FileRow key={d.id} name={d.name} tag={d.format} pending={false} crs={d.source_crs} url={d.file_url} last={i === site.designs.length - 1} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Band>
  );
}

function FileRow({
  name,
  tag,
  pending,
  sizeBytes,
  crs,
  url,
  last,
}: {
  name: string;
  tag?: string;
  pending: boolean;
  sizeBytes?: number;
  crs?: string;
  url?: string;
  last: boolean;
}) {
  const href = downloadUrl(url);
  const share = canonicalUrl(url);
  const size = formatBytes(sizeBytes);

  return (
    <li className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 ${last ? "" : "border-b border-hairline"}`}>
      <Icon icon={fileIcon(name)} size={16} className="shrink-0 text-ink-4" />
      <div className="min-w-0 flex-1">
        <p className="small truncate text-ink-1">{name}</p>
        <p className="num-sm truncate text-ink-4">{[size, crs].filter(Boolean).join(" · ") || "—"}</p>
      </div>
      {tag && <Badge variant="tag">{tag.replace(/_/g, " ")}</Badge>}
      {pending ? (
        <StateChip state={PENDING_UPLOAD} />
      ) : (
        <div className="flex shrink-0 items-center gap-1">
          {share && <IconButton icon={Link04Icon} aria-label="Copy file URL" variant="bare" size="sm" onClick={() => copyUrl(share)} />}
          {href ? (
            <Button asChild variant="quiet" size="sm">
              <a href={href} download={name} title={`Download ${name}`}>
                <Icon icon={Download01Icon} size={16} />
                <span className="visually-hidden">Download {name}</span>
              </a>
            </Button>
          ) : (
            <IconButton icon={Download01Icon} aria-label="No downloadable object for this entry" variant="bare" size="sm" disabled />
          )}
        </div>
      )}
    </li>
  );
}
