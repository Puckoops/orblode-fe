import type { SourceAsset } from "@/lib/api/orblodeSvc";
import { ROLE_LABELS, type FileRole } from "../upload/planner.ts";
import { assetRole } from "./edit.ts";

export const FOLDER_ORDER: readonly FileRole[] = ["dsm", "dtm", "ortho", "pointcloud", "contours", "vector", "site_model", "design"];

export type FolderKey = FileRole | "other";

export interface AssetFolder {
  key: FolderKey;
  label: string;
  assets: SourceAsset[];
}

export function folderKeyOf(asset: SourceAsset): FolderKey {
  return assetRole(asset) ?? "other";
}

export function folderLabel(key: FolderKey): string {
  return key === "other" ? "Other" : ROLE_LABELS[key];
}

export function isFolderKey(value: string | null | undefined): value is FolderKey {
  return value === "other" || (!!value && Object.hasOwn(ROLE_LABELS, value));
}

/** A survey's assets, one folder per asset type, in FOLDER_ORDER with "Other" last; empty types are left out. */
export function assetFolders(assets: SourceAsset[]): AssetFolder[] {
  const byKey = new Map<FolderKey, SourceAsset[]>();
  for (const a of assets) {
    const key = folderKeyOf(a);
    byKey.set(key, [...(byKey.get(key) ?? []), a]);
  }
  const rank = (key: FolderKey) => (key === "other" ? FOLDER_ORDER.length : FOLDER_ORDER.indexOf(key));
  return [...byKey.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([key, list]) => ({ key, label: folderLabel(key), assets: list }));
}

export function totalBytes(items: { size_bytes?: number }[]): number {
  return items.reduce((sum, a) => sum + (a.size_bytes && a.size_bytes > 0 ? a.size_bytes : 0), 0);
}
