/** POSTs JSON to one of this app's auth routes; resolves to null when the network failed outright. */
export async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; message?: string } | null> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) return null;
  const json = (await res.json().catch(() => null)) as { message?: string } | null;
  return { ok: res.ok, status: res.status, message: json?.message };
}

/** Where someone Google vouched for, with no organisation yet, creates one. */
export function googleSignUpPath(next?: string) {
  return `/sign-up?via=google${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}

/** A same-site path to continue to after signing in, or the fallback. */
export function safeNextPath(value: string | null, fallback = "/overview") {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.startsWith("/api/") && !value.startsWith("/files/")
    ? value
    : fallback;
}
