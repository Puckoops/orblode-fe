// The upload half of a run, shared by the upload screen and survey editing: signed slots from
// initUploads, the PUT of each file to its slot, then markAssetUploaded.
//
// Resumable (ORB-38): `slots` is the caller's record of what already happened, keyed by filename,
// and every step records itself there. Calling again after a failure picks up where the last call
// died instead of minting a second asset row for the same file or re-sending finished bytes.
//
// Signed URLs lapse, so a slot's object is signed again right before a PUT that would otherwise go
// out on a dead or dying signature: late in a long batch, or on a retry long after the first attempt.
// Signing again keeps the slot's asset; only the URL changes.

import type { InitiatedUpload, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";
import { contentTypeFor } from "./planner.ts";
import { withRetry, type RetryOptions } from "./retry.ts";

/** A PUT must reach storage before its signature lapses; a slot with less than this left is signed again first. */
const RESIGN_MARGIN_MS = 5 * 60_000;
/** orblode-svc's uploadURLTTL, for a URL that does not carry its own lifetime (the storage emulator's). */
const FALLBACK_URL_TTL_MS = 30 * 60_000;

/** One file's server-side slot, plus exactly how far it got. Both flags matter
 * independently: bytes can be in GCS (`uploaded`) while the PUT that flips the
 * row to `registered` has not landed (`marked`). */
export interface AssetSlot {
  assetId: string;
  /** Canonical object URL, handed to the processors / design registration. */
  url: string;
  /** Signed PUT URL from initUploads, or from resignUpload once it neared expiry. */
  uploadUrl: string;
  /** When uploadUrl's signature lapses, by this client's clock (ms). */
  expiresAt: number;
  uploaded: boolean;
  marked: boolean;
  /** The asset as marking it uploaded returned it, with its detection queued. */
  asset?: SourceAsset;
}

export interface UploadApi {
  initUploads(surveyId: string, files: UploadInitFile[]): Promise<{ uploads: InitiatedUpload[] }>;
  /** A fresh signed PUT URL for a pending asset's own object; records nothing. */
  resignUpload(surveyId: string, assetId: string, contentType: string): Promise<{ upload_url: string }>;
  putToSignedUrl(signedUrl: string, file: File, contentType: string, onProgress: (fraction: number) => void): Promise<void>;
  markAssetUploaded(surveyId: string, assetId: string): Promise<SourceAsset>;
}

export interface UploadFile {
  file: File;
  kind: string;
  role: string;
  crs?: string;
  declaredCrs?: string;
  declaredVerticalDatum?: string;
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

export interface UploadOptions {
  retry?: RetryOptions;
  /** Test seam — defaults to Date.now. */
  now?: () => number;
}

/** Lifetimes run from before the request, since the server signs after it. */
function expiresAt(uploadUrl: string, requestedAt: number): number {
  const lifetimeS = Number(new URL(uploadUrl).searchParams.get("X-Goog-Expires"));
  return requestedAt + (lifetimeS > 0 ? lifetimeS * 1000 : FALLBACK_URL_TTL_MS);
}

/** Uploads every file of the run that is not uploaded and marked yet, sequentially, which keeps
 * memory and connection pressure sane for multi-GB rasters. Rethrows the first failure after
 * reporting that file as "error". */
export async function uploadFiles(api: UploadApi, run: UploadRun, opts: UploadOptions = {}): Promise<void> {
  const { surveyId, files, slots } = run;
  const now = opts.now ?? Date.now;

  // Re-initing a file that already has an asset row would mint a second
  // pending_upload row for the same object.
  const needSlots = files.filter((f) => !slots[f.file.name]);
  if (needSlots.length > 0) {
    run.onStep?.("Requesting upload URLs…");
    const requestedAt = now();
    const { uploads } = await api.initUploads(
      surveyId,
      needSlots.map((f) => ({
        filename: f.file.name,
        kind: f.kind,
        role: f.role,
        content_type: contentTypeFor(f.file.name),
        ...(f.crs ? { crs: f.crs } : {}),
        ...(f.declaredCrs ? { declared_crs: f.declaredCrs } : {}),
        ...(f.declaredVerticalDatum ? { declared_vertical_datum: f.declaredVerticalDatum } : {}),
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
        expiresAt: expiresAt(slot.upload_url, requestedAt),
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
        const contentType = contentTypeFor(name);
        if (now() >= slot.expiresAt - RESIGN_MARGIN_MS) {
          const requestedAt = now();
          const { upload_url } = await withRetry(() => api.resignUpload(surveyId, slot.assetId, contentType), opts.retry);
          slot.uploadUrl = upload_url;
          slot.expiresAt = expiresAt(upload_url, requestedAt);
        }
        await api.putToSignedUrl(slot.uploadUrl, f.file, contentType, (frac) => run.onProgress?.(name, frac));
        slot.uploaded = true;
      }
      // Only GETs auto-retry in lib/api/client.ts, and a single blip here would strand uploaded
      // bytes as pending_upload. Marking is idempotent (it flips one row to registered), so it
      // gets its own retry.
      if (!slot.marked) {
        slot.asset = await withRetry(() => api.markAssetUploaded(surveyId, slot.assetId), opts.retry);
        slot.marked = true;
      }
    } catch (err) {
      run.onStatus?.(name, "error");
      throw err;
    }
    run.onStatus?.(name, "uploaded");
  }
}
