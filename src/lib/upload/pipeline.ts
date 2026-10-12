// The upload half of a run, shared by the upload screen and survey editing: signed slots from
// initUploads, the PUT of each file to its slot, then markAssetUploaded.
//
// Resumable (ORB-38): `slots` is the caller's record of what already happened, keyed by filename,
// and every step records itself there. Calling again after a failure picks up where the last call
// died instead of minting a second asset row for the same file or re-sending finished bytes.

import type { InitiatedUpload, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";
import { contentTypeFor } from "./planner.ts";
import { withRetry, type RetryOptions } from "./retry.ts";

/** One file's server-side slot, plus exactly how far it got. Both flags matter
 * independently: bytes can be in GCS (`uploaded`) while the PUT that flips the
 * row to `registered` has not landed (`marked`). */
export interface AssetSlot {
  assetId: string;
  /** Canonical object URL, handed to the processors / design registration. */
  url: string;
  /** Signed PUT URL from initUploads. */
  uploadUrl: string;
  uploaded: boolean;
  marked: boolean;
}

export interface UploadApi {
  initUploads(surveyId: string, files: UploadInitFile[]): Promise<{ uploads: InitiatedUpload[] }>;
  putToSignedUrl(signedUrl: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void>;
  markAssetUploaded(surveyId: string, assetId: string): Promise<SourceAsset>;
}

export interface UploadFile {
  file: File;
  kind: string;
  role: string;
  crs?: string;
  /** The asset this upload supersedes once it is marked uploaded. */
  replaces?: string;
}

export type UploadFileStatus = "uploading" | "uploaded" | "error";

export interface UploadRun {
  surveyId: string;
  files: UploadFile[];
  /** filename → slot; mutated in place. */
  slots: Record<string, AssetSlot>;
  onStep?: (text: string) => void;
  onStatus?: (filename: string, status: UploadFileStatus) => void;
  onProgress?: (filename: string, fraction: number) => void;
}

/** Uploads every file of the run that is not uploaded and marked yet, sequentially, which keeps
 * memory and connection pressure sane for multi-GB rasters. Rethrows the first failure after
 * reporting that file as "error". */
export async function uploadFiles(api: UploadApi, run: UploadRun, retry?: RetryOptions): Promise<void> {
  const { surveyId, files, slots } = run;

  // Re-initing a file that already has an asset row would mint a second
  // pending_upload row for the same object.
  const needSlots = files.filter((f) => !slots[f.file.name]);
  if (needSlots.length > 0) {
    run.onStep?.("Requesting upload URLs…");
    const { uploads } = await api.initUploads(
      surveyId,
      needSlots.map((f) => ({
        filename: f.file.name,
        kind: f.kind,
        role: f.role,
        content_type: contentTypeFor(f.file.name),
        crs: f.crs,
        ...(f.replaces ? { replaces: f.replaces } : {}),
      }))
    );
    const uploadByName = new Map(uploads.map((u) => [u.asset.filename || "", u]));
    for (const f of needSlots) {
      const slot = uploadByName.get(f.file.name);
      if (!slot) throw new Error(`No upload slot returned for ${f.file.name}`);
      slots[f.file.name] = {
        assetId: slot.asset.id,
        url: slot.asset.url,
        uploadUrl: slot.upload_url,
        uploaded: false,
        marked: false,
      };
    }
  }

  for (const f of files) {
    const name = f.file.name;
    const slot = slots[name];
    if (!slot) throw new Error(`No upload slot for ${name}`);
    if (slot.uploaded && slot.marked) {
      run.onStatus?.(name, "uploaded");
      continue;
    }
    run.onStep?.(`Uploading ${name}…`);
    run.onStatus?.(name, "uploading");
    try {
      if (!slot.uploaded) {
        await api.putToSignedUrl(slot.uploadUrl, f.file, contentTypeFor(name), (frac) => run.onProgress?.(name, frac));
        slot.uploaded = true;
      }
      // Only GETs auto-retry in lib/api/client.ts, and a single blip here would strand uploaded
      // bytes as pending_upload. Marking is idempotent (it flips one row to registered), so it
      // gets its own retry.
      if (!slot.marked) {
        await withRetry(() => api.markAssetUploaded(surveyId, slot.assetId), retry);
        slot.marked = true;
      }
    } catch (err) {
      run.onStatus?.(name, "error");
      throw err;
    }
    run.onStatus?.(name, "uploaded");
  }
}
