// Direct-to-storage upload of one file via its signed PUT URL, with progress.
//
// XHR instead of fetch: fetch has no upload-progress events. The Content-Type header MUST match
// the content_type the URL was signed with (initUploads), or storage rejects the signature.
//
// A cross-origin PUT that dies network-level (status 0) is how a bucket without a CORS rule for
// this origin presents. GEOID retried those through its /gcs rewrite; Orblode's /files proxy is
// read-only, so the failure is reported as what it is instead (see CorsBlockedError).
//
// Timeouts (ORB-38): a single wall-clock cap is the wrong instrument, since a 2 GB raster on a slow
// uplink legitimately takes hours. The primary mechanism is a STALL watchdog on upload-progress
// events (bytes must keep moving), with `xhr.timeout` as a coarse absolute backstop.

/** No upload-progress event for this long → the connection is stalled. */
const STALL_TIMEOUT_MS = 60_000;
/** After the body is fully sent, how long to wait for GCS to answer. */
const RESPONSE_TIMEOUT_MS = 120_000;
/** Coarse per-attempt ceiling. Deliberately generous — the stall watchdog is
 * what actually catches hung connections; this only stops a pathological
 * request from outliving the page. */
const ABSOLUTE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** A stalled / timed-out upload: distinct from a generic Error so the UI can offer a resumable retry. */
export class UploadTimeoutError extends Error {}

/** The browser refused the cross-origin PUT before it reached storage: the bucket's CORS rule
 * does not admit this origin. Retrying cannot help, so the message says what to fix. */
export class CorsBlockedError extends Error {}

class NetworkError extends Error {}

function putOnce(
  url: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let stalledMessage: string | null = null;

    const clearWatchdog = () => {
      if (watchdog !== null) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };
    /** (Re)arm the watchdog. Each progress event pushes the deadline out, so a
     * slow-but-moving upload never trips it. */
    const arm = (ms: number, message: string) => {
      clearWatchdog();
      watchdog = setTimeout(() => {
        stalledMessage = message;
        xhr.abort(); // → onabort below
      }, ms);
    };

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = ABSOLUTE_TIMEOUT_MS;

    xhr.upload.onprogress = (e) => {
      arm(STALL_TIMEOUT_MS, `upload stalled — no data sent for ${STALL_TIMEOUT_MS / 1000}s`);
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    // Body fully sent: from here we are waiting on GCS, and no further upload
    // progress will fire — swap to the response deadline or the watchdog would
    // abort a perfectly healthy request.
    xhr.upload.onload = () => {
      arm(RESPONSE_TIMEOUT_MS, `upload timed out waiting for a response after ${RESPONSE_TIMEOUT_MS / 1000}s`);
    };

    xhr.onload = () => {
      clearWatchdog();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 200) || "no body"}`));
      }
    };
    // status 0 / onerror: network-level failure — for cross-origin PUTs this
    // is how a missing bucket CORS policy presents.
    xhr.onerror = () => {
      clearWatchdog();
      reject(new NetworkError("upload blocked (network/CORS)"));
    };
    xhr.ontimeout = () => {
      clearWatchdog();
      reject(new UploadTimeoutError("upload timed out"));
    };
    // The watchdog aborts through here; a caller-driven abort would too.
    xhr.onabort = () => {
      clearWatchdog();
      reject(
        stalledMessage ? new UploadTimeoutError(stalledMessage) : new Error("upload aborted")
      );
    };

    // Arm before send: a connection that never opens produces no progress
    // events at all, and must still trip the watchdog.
    arm(STALL_TIMEOUT_MS, `upload stalled — no data sent for ${STALL_TIMEOUT_MS / 1000}s`);
    xhr.send(file);
  });
}

/** PUTs `file` to the signed URL, reporting progress as 0..1. Throws `UploadTimeoutError` when the
 * connection stalls and `CorsBlockedError` when the browser blocks the request outright. */
export async function putToSignedUrl(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  try {
    await putOnce(signedUrl, file, contentType, onProgress);
  } catch (err) {
    if (err instanceof NetworkError) {
      throw new CorsBlockedError(
        `the storage bucket refused the upload from ${typeof window === "undefined" ? "this origin" : window.location.origin}; ` +
          "check the connection, then ask an administrator to allow this origin in the bucket's CORS rule"
      );
    }
    throw err;
  }
}
