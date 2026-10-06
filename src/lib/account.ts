import "server-only";
import { PRODUCT, userSvcBase } from "./session";

export interface Reply<T> {
  status: number;
  ok: boolean;
  message?: string;
  data?: T;
}

/** One account-flow call to user-svc, always naming Orblode as the product. */
export async function accountPost<T>(path: string, body: Record<string, unknown>): Promise<Reply<T>> {
  try {
    const res = await fetch(`${userSvcBase()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, type: PRODUCT }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string; data?: T } | null;
    return { status: res.status, ok: res.ok && !!json && !json.error, message: json?.message, data: json?.data };
  } catch {
    return { status: 502, ok: false };
  }
}

/** A path on this site to return to after signing in, or null for anything that could leave it. */
export function safeNext(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.startsWith("/api/") &&
    !value.startsWith("/files/")
    ? value
    : null;
}

/** An absolute link to a page here, carrying where to go after signing in. */
export function pageUrl(origin: string, path: string, next: string | null) {
  const url = new URL(path, origin);
  if (next) url.searchParams.set("next", next);
  return url.toString();
}
