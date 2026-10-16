import type { SourceAsset, Survey, UpdateSurveyRequest } from "@/lib/api/orblodeSvc";
import {
  PROCESSED_OUTPUT,
  ROLE_LABELS,
  UNREADABLE_SKIP,
  buildProcessorPlan,
  skipReason,
  vectorFeaturesReads,
  type FileRole,
  type PlannedFile,
  type ProcessorPlan,
} from "../upload/planner.ts";

const EDITABLE_STATUSES = new Set(["pending", "processing", "ready_to_approve", "failed"]);

export function isSurveyEditable(status: string | null | undefined): boolean {
  return EDITABLE_STATUSES.has((status ?? "").toLowerCase());
}

export interface SurveyDetails {
  surveyDate: string;
  surveyType: string;
  datasetName: string;
  tags: string[];
}

export function surveyDetailsOf(survey: Survey): SurveyDetails {
  const meta = survey.metadata ?? {};
  return {
    surveyDate: survey.survey_date.slice(0, 10),
    surveyType: survey.survey_type,
    datasetName: typeof meta.dataset_name === "string" ? meta.dataset_name : "",
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

/** The PATCH body for what the form changed, or null when it changed nothing. */
export function surveyDetailsPatch(survey: Survey, form: SurveyDetails): UpdateSurveyRequest | null {
  const was = surveyDetailsOf(survey);
  const body: UpdateSurveyRequest = { expected_updated_at: survey.updated_at };
  let changed = false;
  if (form.surveyDate !== was.surveyDate) {
    body.survey_date = form.surveyDate;
    changed = true;
  }
  if (form.surveyType !== was.surveyType) {
    body.survey_type = form.surveyType;
    changed = true;
  }
  const name = form.datasetName.trim();
  if (name !== was.datasetName.trim()) {
    body.dataset_name = name;
    changed = true;
  }
  if (form.tags.length !== was.tags.length || form.tags.some((t, i) => t !== was.tags[i])) {
    body.tags = form.tags;
    changed = true;
  }
  return changed ? body : null;
}

/** The CRS the survey's files were uploaded in, for assets that carry none of their own. */
export function surveySourceCrs(survey: Survey): string {
  const crs = survey.metadata?.source_crs;
  return typeof crs === "string" && crs ? crs : survey.working_crs;
}

const KIND_ROLES: Record<string, FileRole> = {
  terrain: "dsm",
  ortho: "ortho",
  pointcloud: "pointcloud",
  vector: "vector",
  site_model: "site_model",
};

export function assetRole(asset: SourceAsset): FileRole | null {
  if (asset.role && Object.hasOwn(ROLE_LABELS, asset.role)) return asset.role as FileRole;
  return Object.hasOwn(KIND_ROLES, asset.kind) ? KIND_ROLES[asset.kind] : null;
}

export function assetName(asset: SourceAsset): string {
  return asset.filename || asset.url.split("/").pop() || asset.id;
}

/** Listed and holding its bytes: not removed, superseded or still waiting for its upload. */
export function isProcessableAsset(asset: SourceAsset): boolean {
  return asset.is_active !== false && asset.status !== "removed" && asset.status !== "superseded" && asset.status !== "pending_upload";
}

/** GDAL couldn't open it when it was checked, so it stays out of reprocessing until Detect again reads it. */
const isUnreadable = (asset: SourceAsset) => asset.detection?.status === "failed";

/** A processable file whose role builds a layer from a file like it: one worth running through its processor again. */
export function canReprocess(asset: SourceAsset): boolean {
  const role = assetRole(asset);
  return isProcessableAsset(asset) && !isUnreadable(asset) && role !== null && PROCESSED_OUTPUT[role] !== null && skipReason(assetName(asset), role) === null;
}

const isVectorRole = (role: FileRole | null) => role === "vector" || role === "contours";
const joinsVectorBatch = (a: SourceAsset) => isVectorRole(assetRole(a)) && vectorFeaturesReads(assetName(a)) && !isUnreadable(a);

export interface ReprocessPlan extends ProcessorPlan {
  /** Every asset the dispatches reference. */
  assets: SourceAsset[];
}

/** Dispatches for the assets that need processing, each in its own CRS, else its upload's fallback, else `epsg`.
 * vector-features builds every vector layer of a survey from one call, so a vector or contour file
 * that needs processing brings all of the survey's vector and contour files into the batch. */
export function reprocessPlan(assets: SourceAsset[], opts: { epsg: string; alsoDue?: ReadonlySet<string> }): ReprocessPlan {
  const ready = assets.filter(isProcessableAsset);
  const isDue = (a: SourceAsset) => a.needs_processing === true || (opts.alsoDue?.has(a.id) ?? false);
  const withVectors = ready.some((a) => isDue(a) && joinsVectorBatch(a));
  const batch = ready.filter((a) => isDue(a) || (withVectors && joinsVectorBatch(a)));
  const files = batch.flatMap((a): PlannedFile[] => {
    const role = assetRole(a);
    return role ? [{ name: assetName(a), role, url: a.url, crs: a.crs || a.declared_crs || undefined, skip: isUnreadable(a) ? UNREADABLE_SKIP : undefined }] : [];
  });
  return { ...buildProcessorPlan(files, { epsg: opts.epsg }), assets: batch };
}
