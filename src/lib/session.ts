import "server-only";
import { cookies } from "next/headers";
import { parseProfile, type Profile } from "./profile";

export const SESSION_COOKIE = "orblode_session";
export const PROFILE_COOKIE = "orblode_profile";
/** Set at sign-in with "Remember me", so a new token later (after a password change) keeps the same lifetime. */
export const REMEMBER_COOKIE = "orblode_remember";

/** The product user-svc signs people in for; signing in adds it to an account. */
export const PRODUCT = "orblode";

function base(name: "USER_SVC_URL" | "ORBLODE_SVC_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value.replace(/\/+$/, "");
}

export const userSvcBase = () => base("USER_SVC_URL");
export const orblodeSvcBase = () => base("ORBLODE_SVC_URL");

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** Who is signed in and for which client, as the login response said; display only, never authorisation. */
export async function sessionProfile(): Promise<Profile | null> {
  const store = await cookies();
  if (!store.has(SESSION_COOKIE)) return null;
  return parseProfile(store.get(PROFILE_COOKIE)?.value);
}

/** Without an expiry the cookie lasts as long as the browser session, which is what "Remember me" switches off. */
export function sessionCookieOptions(expiresAtUnix?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expiresAtUnix ? { expires: new Date(expiresAtUnix * 1000) } : {}),
  };
}

/** The cookie options a session issued later in it gets: an expiry only if sign-in was remembered. */
export async function renewedCookieOptions(expiresAtUnix: number) {
  const remembered = (await cookies()).get(REMEMBER_COOKIE)?.value === "1";
  return sessionCookieOptions(remembered && expiresAtUnix > 0 ? expiresAtUnix : undefined);
}

/** When the session token expires (its exp claim, unix seconds), for cookies issued alongside it later. */
export function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    return 0;
  }
}
