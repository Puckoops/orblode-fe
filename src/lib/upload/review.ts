// The upload's review step, pure: rows from the uploaded assets and what the uploader picked, whether
// Process can run, the PATCHes that save the review, and the per-file input for buildProcessorPlan.

import type { CrsSource, SourceAsset, UpdateSurveyAssetRequest } from "@/lib/api/orblodeSvc";
import { assetName } from "../survey/edit.ts";
import { CRS_OPTIONS } from "./options.ts";
import { SELECTABLE_ROLES, UNREADABLE_SKIP, roleToAssetKind, skipReason, type DataType, type FileRole, type PlannedFile } from "./planner.ts";

export const DETECTION_POLL_INTERVAL_MS = 1_500;
export const DETECTION_POLL_WINDOW_MS = 90_000;
export const DETECTION_STALE_AFTER_MS = 120_000;

export type CrsSourceLabel = "from file" | "from other files" | "from earlier surveys" | "from the project's location" | "assumed" | "you";

const SOURCE_LABELS: Record<CrsSource, CrsSourceLabel> = {
  header: "from file",
  format: "from file",
  sibling: "from other files",
  previous: "from earlier surveys",
  site: "from the project's location",
  declared: "assumed",
  range: "assumed",
  user: "you",
};

export function isDetectionStale(asset: SourceAsset, now: number): boolean {
  const d = asset.detection;
  return d?.status === "inspecting" && !!d.requested_at && now - d.requested_at > DETECTION_STALE_AFTER_MS;
}

export function isInspecting(asset: SourceAsset, now: number): boolean {
  return asset.detection?.status === "inspecting" && !isDetectionStale(asset, now);
}

/** Failed, unavailable or stuck: worth asking the server to read the file again. */
export function canDetectAgain(asset: SourceAsset, now: number): boolean {
  const status = asset.detection?.status;
  return status === "failed" || status === "unavailable" || isDetectionStale(asset, now);
}

/** What the Notes column says about the read itself, or null when it went fine or is still going. */
export function detectionNote(asset: SourceAsset, now: number): string | null {
  const d = asset.detection;
  if (!d) return null;
  if (d.status === "failed") return d.error && !/\/vsi|gs:\/\//.test(d.error) ? `Couldn't read the file: ${d.error}` : "Couldn't read the file";
  if (d.status === "unavailable") return "The file reader didn't answer, so nothing was read from the file";
  if (isDetectionStale(asset, now)) return "Still reading after two minutes";
  return null;
}

/** A hand-set CRS, else the one the server resolved, else the upload's fallback. */
export function effectiveCrs(asset: SourceAsset, handCrs?: string): string {
  return handCrs || asset.crs || asset.declared_crs || "";
}

/** Where a file's CRS came from, for its chip; null for an asset uploaded before detection, or with no CRS. */
export function crsSourceLabel(asset: SourceAsset, handCrs?: string): CrsSourceLabel | null {
  if (handCrs) return "you";
  const crs = effectiveCrs(asset);
  if (!crs) return null;
  const detected = asset.detection?.crs;
  if (detected?.epsg === crs) return SOURCE_LABELS[detected.source] ?? null;
  if (crs === asset.declared_crs) return "assumed";
  return asset.detection ? "you" : null;
}

/** The curated CRS list plus what this file brings: the detected code (named), its alternatives, the fallback and the current choice. */
export function crsChoices(asset: SourceAsset, current: string): { value: string; label: string }[] {
  const options = [...CRS_OPTIONS];
  const detected = asset.detection?.crs;
  for (const code of [detected?.epsg, ...(detected?.candidates ?? []), asset.declared_crs, current]) {
    if (!code || options.some((o) => o.value === code)) continue;
    options.push({ value: code, label: code === detected?.epsg && detected.name ? `${detected.name} (${code})` : code });
  }
  return options;
}

/** One uploaded file going into review. */
export interface ReviewEntry {
  asset: SourceAsset;
  /** The role the upload queue held: picked by hand, or the name/header guess. */
  queuedRole: FileRole;
  roleByHand: boolean;
}

/** What the person changed in the review table, per asset id. */
export interface RowEdit {
  role?: FileRole;
  crs?: string;
  verticalDatum?: string;
}

export interface ReviewRow {
  assetId: string;
  name: string;
  asset: SourceAsset;
  role: FileRole;
  crs: string;
  crsSource: CrsSourceLabel | null;
  verticalDatum: string;
  inspecting: boolean;
  stale: boolean;
  detectAgain: boolean;
  /** Why the file is stored but not processed; null when it is processed and so needs a CRS. */
  skipReason: string | null;
  /** The detection's warnings, then any note about the read itself. */
  notes: string[];
}

/** A role picked by hand, else the server's suggestion when this data type offers it, else the queue's guess. */
export function effectiveRole(entry: ReviewEntry, dataType: DataType, edit?: RowEdit): FileRole {
  if (edit?.role) return edit.role;
  if (entry.roleByHand) return entry.queuedRole;
  const suggested = entry.asset.detection?.suggested_role;
  return suggested && SELECTABLE_ROLES[dataType].includes(suggested) ? suggested : entry.queuedRole;
}

export function buildReviewRows(entries: ReviewEntry[], edits: Record<string, RowEdit>, dataType: DataType, now: number): ReviewRow[] {
  return entries.map((entry) => {
    const { asset } = entry;
    const edit = edits[asset.id];
    const name = assetName(asset);
    const role = effectiveRole(entry, dataType, edit);
    const plannerSkip = skipReason(name, role);
    const unreadable = asset.detection?.status === "failed" && !edit?.role && !entry.roleByHand;
    const note = detectionNote(asset, now);
    return {
      assetId: asset.id,
      name,
      asset,
      role,
      crs: effectiveCrs(asset, edit?.crs),
      crsSource: crsSourceLabel(asset, edit?.crs),
      verticalDatum: edit?.verticalDatum || asset.vertical_datum || asset.declared_vertical_datum || "",
      inspecting: isInspecting(asset, now),
      stale: isDetectionStale(asset, now),
      detectAgain: canDetectAgain(asset, now),
      skipReason: plannerSkip ? asset.detection?.skip_reason || plannerSkip : unreadable ? UNREADABLE_SKIP : null,
      notes: [...(asset.detection?.warnings ?? []), ...(note ? [note] : [])],
    };
  });
}

/** Rows that will be processed but have no CRS yet. */
export function rowsMissingCrs(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter((r) => r.skipReason === null && !r.crs);
}

/** Every processed file has a CRS, and no file is still being read unless the person chose not to wait. */
export function canProcess(rows: ReviewRow[], skipWaiting: boolean): boolean {
  return rows.length > 0 && rowsMissingCrs(rows).length === 0 && (skipWaiting || !rows.some((r) => r.inspecting));
}

export interface AssetPatch {
  assetId: string;
  name: string;
  patch: UpdateSurveyAssetRequest;
}

/** The PATCHes that save the review: a role that differs from the stored one (a suggestion or a hand pick),
 * and the CRS and datum only where they were picked by hand, so a fallback never reads as the person's choice. */
export function reviewPatches(rows: ReviewRow[], edits: Record<string, RowEdit>): AssetPatch[] {
  return rows.flatMap((row) => {
    const edit = edits[row.assetId];
    const patch: UpdateSurveyAssetRequest = {};
    if (row.role !== row.asset.role) {
      patch.role = row.role;
      patch.kind = roleToAssetKind(row.role);
    }
    if (edit?.crs && edit.crs !== (row.asset.crs ?? "")) patch.crs = edit.crs;
    if (edit?.verticalDatum && edit.verticalDatum !== (row.asset.vertical_datum ?? "")) patch.vertical_datum = edit.verticalDatum;
    return Object.keys(patch).length > 0 ? [{ assetId: row.assetId, name: row.name, patch }] : [];
  });
}

/** buildProcessorPlan's input: each file with its own role and CRS, stored only when its row says so. */
export function plannedFiles(rows: ReviewRow[]): PlannedFile[] {
  return rows.map((r) => ({ name: r.name, role: r.role, url: r.asset.url, crs: r.crs || undefined, skip: r.skipReason ?? undefined }));
}

export function fileWarnings(rows: ReviewRow[]): { filename: string; warnings: string[] }[] {
  return rows.filter((r) => r.notes.length > 0).map((r) => ({ filename: r.name, warnings: r.notes }));
}

function crsName(row: ReviewRow): string | undefined {
  const detected = row.asset.detection?.crs;
  if (detected?.epsg === row.crs && detected.name) return detected.name;
  return CRS_OPTIONS.find((o) => o.value === row.crs)?.label;
}

function isProjected(crs: string, name: string | undefined): boolean {
  if (name) return name.includes(" / ");
  const code = Number(crs.replace(/^EPSG:/i, ""));
  // EPSG keeps geographic CRSs in 4000–4999 (and GDA2020's at 7844); the few projected exceptions there are rare enough to ignore.
  return Number.isInteger(code) && code > 0 && !(code >= 4000 && code < 5000) && code !== 7844;
}

/** The projected CRS most of the files resolved to (the first on a tie), for a new site created without one. */
export function siteCrsFrom(rows: ReviewRow[]): { epsg: string; label: string } | null {
  const counts = new Map<string, { n: number; label: string }>();
  for (const row of rows) {
    if (!row.crs) continue;
    const name = crsName(row);
    if (!isProjected(row.crs, name)) continue;
    const seen = counts.get(row.crs);
    counts.set(row.crs, { n: (seen?.n ?? 0) + 1, label: seen?.label ?? name ?? row.crs });
  }
  let best: { epsg: string; label: string } | null = null;
  let most = 0;
  for (const [epsg, { n, label }] of counts) {
    if (n > most) {
      best = { epsg, label };
      most = n;
    }
  }
  return best;
}
