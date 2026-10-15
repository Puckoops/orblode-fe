"use client";

import { FolderOffIcon, PencilEdit02Icon, RefreshIcon, SearchRemoveIcon } from "@hugeicons/core-free-icons";
import { Alert, Breadcrumbs, Button, EmptyState, IconButton, Page, PageHeader, type Crumb } from "@puckoops/camelot";
import Link from "next/link";
import type { ReactNode } from "react";
import { Loader } from "@/components/brand/Loader";
import { ProcessingChip } from "@/components/viewer/ProcessingChip";
import { useSurveyProcessing } from "@/lib/processing/store";
import { formatSurveyDate } from "@/lib/utils";
import { Files, FolderGlyph, fileCount, formatBytes } from "./FileParts";
import { nameMatches, resolveFolder, siteAnchor, surveyAnchor, type OpenFolder, type SiteGroup } from "./tree";
import type { ViewMode } from "./viewMode";

/** One open folder: a survey's files of one asset type, or a site's designs. */
export function FolderView({
  open,
  sites,
  loadError,
  query,
  toolbar,
  view,
  onRefresh,
  onEditSurvey,
}: {
  open: OpenFolder;
  sites: SiteGroup[] | null;
  loadError: string | null;
  query: string;
  toolbar: ReactNode;
  view: ViewMode;
  onRefresh: () => void;
  onEditSurvey: (surveyId: string) => void;
}) {
  const folder = sites ? resolveFolder(sites, open) : null;
  const survey = folder?.survey;
  const processing = useSurveyProcessing(survey?.id);
  const loading = sites === null && !loadError;
  const entries = folder ? folder.entries.filter((e) => nameMatches(e.name, query)) : [];

  const crumbs: Crumb[] = [{ label: "Files", href: "/files" }];
  if (folder) {
    crumbs.push({ label: folder.site.name, href: `/files#${siteAnchor(folder.site.id)}` });
    if (folder.survey) crumbs.push({ label: formatSurveyDate(folder.survey.survey_date), href: `/files#${surveyAnchor(folder.survey.id)}` });
    crumbs.push({ label: folder.label });
  }

  return (
    <Page>
      <PageHeader
        back={<Breadcrumbs items={crumbs} linkAs={Link} />}
        title={
          folder ? (
            <span className="inline-flex items-center gap-3">
              <FolderGlyph type={folder.icon} size={44} />
              {folder.label}
            </span>
          ) : (
            "Folder"
          )
        }
        subtitle={
          loading
            ? "Loading folder…"
            : folder
              ? [fileCount(folder.entries.length), formatBytes(folder.bytes), folder.survey ? `${folder.site.name} survey of ${formatSurveyDate(folder.survey.survey_date)}` : `Registered for ${folder.site.name}`]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
        }
        actions={
          <>
            {survey && (
              <>
                <Button variant="ghost" iconStart={PencilEdit02Icon} onClick={() => onEditSurvey(survey.id)}>
                  Edit survey
                </Button>
                {processing ? (
                  <ProcessingChip />
                ) : (
                  <Button asChild variant="ghost">
                    <Link href={`/viewer/${survey.id}`}>Open in viewer</Link>
                  </Button>
                )}
              </>
            )}
            <IconButton icon={RefreshIcon} aria-label="Refresh" disabled={loading} onClick={onRefresh} />
          </>
        }
      />

      <div className="flex max-w-3xl flex-col gap-8">
        {toolbar}

        {loadError ? (
          <Alert tone="critical" title="Files couldn't load">
            {loadError}
          </Alert>
        ) : loading ? (
          <Loader label="Loading files" />
        ) : !folder ? (
          <EmptyState
            icon={FolderOffIcon}
            title="This folder isn't in your current workspace."
            description="Its survey may have been removed, or it belongs to another workspace."
            framed
            action={
              <Button asChild variant="ghost">
                <Link href="/files">Back to Files</Link>
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          <EmptyState icon={query ? SearchRemoveIcon : FolderOffIcon} title={query ? "No files in this folder match your search." : "This folder is empty."} framed />
        ) : (
          <Files entries={entries} view={view} />
        )}
      </div>
    </Page>
  );
}
