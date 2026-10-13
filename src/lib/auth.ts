export type { AuthClient, AuthMembership, AuthUser, Profile } from "./profile.ts";

/**
 * Sends the person to sign in again, keeping where they were. A route handler, not a page: it
 * clears the httpOnly session cookie, which only a full navigation can reach.
 */
export function redirectToSignIn() {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/sign-in")) return;
  const next = window.location.pathname + window.location.search;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/api/auth/expired?next=${encodeURIComponent(next)}`;
}

/**
 * Moves the session to another of the person's organisations, then loads `to` afresh so nothing of
 * the last one stays in memory. Resolves to why it failed, or never settles once it is navigating.
 */
export async function switchOrganisation(clientId: string, to = "/globe"): Promise<string> {
  const res = await fetch("/api/auth/organisation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) return "We couldn't reach Orblode. Check your connection and try again.";
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    return json?.message ?? "Couldn't open that organisation. Try again.";
  }
  window.location.href = to;
  return new Promise<string>(() => {});
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
}
