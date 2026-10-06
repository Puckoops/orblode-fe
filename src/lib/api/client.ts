import { ApiError, readBody } from "./envelope.ts";
import { redirectToSignIn } from "../auth.ts";

export { ApiError };

/** Same-origin route handlers that attach the session's bearer: orblode-svc and user-svc. */
export const ORBLODE_API = "/api/orblode";
export const USERS_API = "/api/users";

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Caller-supplied cancellation; defaults to a per-attempt timeout when omitted. */
  signal?: AbortSignal;
}

// Per attempt, so a hung backend surfaces as a failed attempt instead of a request pending forever.
const DEFAULT_TIMEOUT_MS = 20_000;
// Only idempotent GETs auto-retry, and only on transient failures; a retried POST could double-submit.
const MAX_GET_RETRIES = 2;
const RETRY_BACKOFF_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A network failure, a timeout (408) or a 5xx is worth another attempt; a 4xx is deterministic. */
function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 408 || err.status >= 500;
  return true;
}

export async function apiFetch<T>(baseUrl: string, path: string, opts: ApiFetchOptions = {}): Promise<T> {
  // A caller-supplied signal means the caller owns cancellation, so it is not retried either.
  const retries = (opts.method ?? "GET") === "GET" && !opts.signal ? MAX_GET_RETRIES : 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiFetchOnce<T>(baseUrl, path, opts);
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !isTransient(err)) throw err;
      await sleep(RETRY_BACKOFF_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

async function apiFetchOnce<T>(baseUrl: string, path: string, opts: ApiFetchOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const signal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ApiError(408, "Request timed out");
    }
    throw err;
  }

  if (res.status === 401) {
    redirectToSignIn();
    throw new ApiError(401, "Session expired");
  }
  if (res.status === 204) return undefined as T;
  return readBody<T>(res.status, res.ok, await res.text());
}
