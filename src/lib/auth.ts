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

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
}
