import type { PhotoExif } from "../api/mm.ts";

// A flight's photos uploaded straight to storage: each gets a name unique within the flight, they are signed in batches
// and PUT a few at a time with retries, and an upload that stopped picks up with what storage does not have yet.

export const PHOTO_BATCH = 500;
export const PHOTO_CONCURRENCY = 5;
const PUT_ATTEMPTS = 3;

const PHOTO_EXT = /\.(jpe?g|tiff?)$/i;

export const isPhoto = (name: string) => PHOTO_EXT.test(name);

export const photoContentType = (name: string) => (/\.tiff?$/i.test(name) ? "image/tiff" : "image/jpeg");

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

/** The camera's folder and the file's name, so DJI's DJI_0001.JPG in 100MEDIA and 101MEDIA stay apart. Spaces become
 * underscores: photogrammetry's ground control file separates its fields with spaces. */
export function photoName(file: { name: string; webkitRelativePath?: string }): string {
  const parts = (file.webkitRelativePath || file.name).split(/[\\/]/).filter(Boolean);
  const base = safe(parts[parts.length - 1] ?? file.name);
  const folder = parts.length > 1 ? safe(parts[parts.length - 2]) : "";
  return folder ? `${folder}_${base}` : base;
}

/** A name for each file, with _2, _3 … added where two would still clash. */
export function nameAll<F extends { name: string; webkitRelativePath?: string }>(files: readonly F[], taken: Iterable<string> = []): { file: F; name: string }[] {
  const used = new Set(taken);
  return files.map((file) => {
    let name = photoName(file);
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let i = 2;
      while (used.has(`${stem}_${i}${ext}`)) i++;
      name = `${stem}_${i}${ext}`;
    }
    used.add(name);
    return { file, name };
  });
}

export function batches<T>(items: readonly T[], size = PHOTO_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The photos storage does not have yet. */
export function stillToUpload<P extends { name: string }>(photos: readonly P[], uploaded: readonly string[]): P[] {
  const have = new Set(uploaded);
  return photos.filter((p) => !have.has(p.name));
}

export interface PhotoToUpload {
  name: string;
  file: File;
  exif: PhotoExif;
}

export interface PhotoUploadApi {
  sign: (photos: { name: string; size: number; exif: PhotoExif }[]) => Promise<Record<string, string>>;
  put: (url: string, file: File, contentType: string, onProgress: (fraction: number) => void) => Promise<void>;
}

export interface PhotoProgress {
  done: number;
  total: number;
  /** Bytes sent of all bytes, 0–1. */
  fraction: number;
}

/** Uploads the photos, PHOTO_CONCURRENCY at a time. A photo that fails PUT_ATTEMPTS times stops the upload. */
export async function uploadPhotos(
  api: PhotoUploadApi,
  photos: readonly PhotoToUpload[],
  {
    onProgress,
    concurrency = PHOTO_CONCURRENCY,
    retryDelayMs = 2_000,
    signal,
  }: { onProgress?: (p: PhotoProgress) => void; concurrency?: number; retryDelayMs?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const totalBytes = photos.reduce((sum, p) => sum + p.file.size, 0) || 1;
  const sent = new Map<string, number>();
  let done = 0;
  const report = () => {
    let bytes = 0;
    for (const v of sent.values()) bytes += v;
    onProgress?.({ done, total: photos.length, fraction: Math.min(1, bytes / totalBytes) });
  };

  for (const batch of batches(photos)) {
    const urls = await api.sign(batch.map((p) => ({ name: p.name, size: p.file.size, exif: p.exif })));
    let next = 0;
    let failed: unknown = null;
    const worker = async () => {
      while (failed === null && next < batch.length) {
        if (signal?.aborted) throw new DOMException("Upload stopped", "AbortError");
        const photo = batch[next++];
        const url = urls[photo.name];
        if (!url) {
          failed = new Error(`${photo.name} was not signed for upload`);
          return;
        }
        for (let attempt = 1; ; attempt++) {
          try {
            await api.put(url, photo.file, photoContentType(photo.name), (f) => {
              sent.set(photo.name, f * photo.file.size);
              report();
            });
            break;
          } catch (err) {
            sent.set(photo.name, 0);
            if (attempt >= PUT_ATTEMPTS || signal?.aborted) {
              failed = err;
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
          }
        }
        sent.set(photo.name, photo.file.size);
        done++;
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
    if (failed !== null) throw failed;
  }
}
