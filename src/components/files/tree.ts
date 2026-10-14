import {
  BlueprintIcon,
  CubeIcon,
  File01Icon,
  Image01Icon,
  Layers01Icon,
  MountainIcon,
  PolygonIcon,
  ThreeDViewIcon,
  WavesIcon,
} from "@hugeicons/core-free-icons";
import type { IconDefinition } from "@puckoops/camelot";
import type { Author, DesignRecord, SourceAsset, Survey } from "@/lib/api/orblodeSvc";
import type { Project } from "@/lib/api/userSvc";
import { assetName } from "@/lib/survey/edit";
import { folderKeyOf, folderLabel, isFolderKey, totalBytes, type FolderKey } from "@/lib/survey/folders";
import type { EpochMs } from "@/lib/time";

export interface SurveyGroup {
  survey: Survey;
  assets: SourceAsset[];
}

export interface SiteGroup {
  project: Project;
  surveys: SurveyGroup[];
  designs: DesignRecord[];
}

export const FOLDER_ICONS: Record<FolderKey, IconDefinition> = {
  dsm: MountainIcon,
  dtm: Layers01Icon,
  ortho: Image01Icon,
  pointcloud: CubeIcon,
  contours: WavesIcon,
  vector: PolygonIcon,
  site_model: ThreeDViewIcon,
  design: BlueprintIcon,
  other: File01Icon,
};

const DESIGNS_FOLDER = "designs";

/** The folder named by /files?survey=<id>&folder=<type> or /files?site=<id>&folder=designs; null is the overview. */
export type OpenFolder = { kind: "survey"; surveyId: string; folder: FolderKey } | { kind: "designs"; siteId: string };

export function openFolderFrom(params: { get(name: string): string | null }): OpenFolder | null {
  const folder = params.get("folder");
  const surveyId = params.get("survey");
  const siteId = params.get("site");
  if (surveyId && isFolderKey(folder)) return { kind: "survey", surveyId, folder };
  if (siteId && folder === DESIGNS_FOLDER) return { kind: "designs", siteId };
  return null;
}

export const surveyFolderHref = (surveyId: string, folder: FolderKey) => `/files?survey=${encodeURIComponent(surveyId)}&folder=${folder}`;
export const designsFolderHref = (siteId: string) => `/files?site=${encodeURIComponent(siteId)}&folder=${DESIGNS_FOLDER}`;
export const siteAnchor = (siteId: string) => `site-${siteId}`;
export const surveyAnchor = (surveyId: string) => `survey-${surveyId}`;

export interface Stamp {
  at?: EpochMs;
  by?: Author;
}

export interface FileEntry {
  id: string;
  name: string;
  tag?: string;
  pending: boolean;
  sizeBytes?: number;
  crs?: string;
  url?: string;
  added: Stamp;
  edited?: Stamp;
}

/** Inside a type folder the type goes without saying; only Other tags each file with its ingest kind. */
export function assetEntry(a: SourceAsset): FileEntry {
  return {
    id: a.id,
    name: assetName(a),
    tag: folderKeyOf(a) === "other" ? a.role || a.kind : undefined,
    pending: a.status === "pending_upload",
    sizeBytes: a.size_bytes,
    crs: a.crs,
    url: a.url,
    added: { at: a.created_at, by: a.created_by },
  };
}

export function designEntry(d: DesignRecord): FileEntry {
  return {
    id: d.id,
    name: d.name,
    tag: d.format,
    pending: false,
    crs: d.source_crs,
    url: d.file_url,
    added: { at: d.created_at, by: d.created_by },
    edited: d.edited_by ? { at: d.updated_at, by: d.edited_by } : undefined,
  };
}

export const nameMatches = (name: string, q: string) => !q || name.toLowerCase().includes(q);

export interface ResolvedFolder {
  site: Project;
  survey?: Survey;
  label: string;
  icon: IconDefinition;
  entries: FileEntry[];
  bytes: number;
}

export function resolveFolder(sites: SiteGroup[], open: OpenFolder): ResolvedFolder | null {
  if (open.kind === "designs") {
    const site = sites.find((s) => s.project.id === open.siteId);
    if (!site) return null;
    return { site: site.project, label: "Designs", icon: BlueprintIcon, entries: site.designs.map(designEntry), bytes: 0 };
  }
  for (const site of sites) {
    const group = site.surveys.find((sg) => sg.survey.id === open.surveyId);
    if (!group) continue;
    const assets = group.assets.filter((a) => folderKeyOf(a) === open.folder);
    return {
      site: site.project,
      survey: group.survey,
      label: folderLabel(open.folder),
      icon: FOLDER_ICONS[open.folder],
      entries: assets.map(assetEntry),
      bytes: totalBytes(assets),
    };
  }
  return null;
}
