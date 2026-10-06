// Stored artifact URLs are https://storage.googleapis.com/<bucket>/<key>; the browser reads them
// same-origin as /files/<key> (proxy.ts forwards to orblode-svc's files proxy with the session).
// Values sent back to the API must be the stored URL again, so each bucket seen on the way in
// is remembered per key.

export const GCS_HTTP = "https://storage.googleapis.com/";
export const GCS_SCHEME = "gs://";
export const FILES_PREFIX = "/files/";

const bucketByKey = new Map<string, string>();
let lastBucket: string | null = null;

function split(rest: string): { bucket: string; key: string } | null {
  const slash = rest.indexOf("/");
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

/** Same-origin path for a stored object URL (https or gs://); other URLs come back unchanged. */
export function toFilesUrl(url: string): string {
  const rest = url.startsWith(GCS_HTTP) ? url.slice(GCS_HTTP.length) : url.startsWith(GCS_SCHEME) ? url.slice(GCS_SCHEME.length) : null;
  if (rest === null) return url;
  const parts = split(rest);
  if (!parts) return url;
  const bare = parts.key.split(/[?#]/)[0];
  bucketByKey.set(bare, parts.bucket);
  lastBucket = parts.bucket;
  return FILES_PREFIX + parts.key;
}

/** The stored URL behind a /files/ path; anything else comes back unchanged. */
export function fromFilesUrl(url: string): string {
  if (!url.startsWith(FILES_PREFIX)) return url;
  const key = url.slice(FILES_PREFIX.length);
  const bucket = bucketByKey.get(key.split(/[?#]/)[0]) ?? lastBucket;
  return bucket ? `${GCS_HTTP}${bucket}/${key}` : url;
}

/** Deep-rewrites every stored object URL in a manifest-shaped value onto /files/. */
export function filesUrlsIn<T>(value: T): T {
  if (typeof value === "string") return toFilesUrl(value) as T;
  if (Array.isArray(value)) return value.map(filesUrlsIn) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = filesUrlsIn(v);
    return out as T;
  }
  return value;
}

/** A link that downloads the object under its own name: orblode-svc answers with a short-lived signed URL. */
export function downloadUrl(url: string | undefined): string | null {
  if (!url) return null;
  const local = toFilesUrl(url);
  if (!local.startsWith(FILES_PREFIX)) return null;
  return `${local}${local.includes("?") ? "&" : "?"}download=1`;
}

/** The canonical https URL for a stored object, as processors consume it. */
export function canonicalUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith(GCS_SCHEME)) return GCS_HTTP + url.slice(GCS_SCHEME.length);
  if (url.startsWith(FILES_PREFIX)) return fromFilesUrl(url);
  return url;
}
