import "server-only";
import { cookies } from "next/headers";
import type { Reply } from "./account";

/**
 * Swaps the code from Google's sign-in popup for the ID token user-svc verifies. 503 means this deployment
 * has no client secret, or Google refused it; 401 means the code was bad, spent or expired.
 */
export async function googleIdToken(code: string): Promise<Reply<string>> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("google sign-in: NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
    return { status: 503, ok: false };
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      // A popup code flow has no redirect page; Google expects the literal "postmessage" here.
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: "postmessage", grant_type: "authorization_code" }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
    if (res.ok && typeof json?.id_token === "string") return { status: 200, ok: true, data: json.id_token };
    if (json?.error === "invalid_client" || json?.error === "unauthorized_client") {
      console.error("google sign-in: Google refused the client credentials", json.error);
      return { status: 503, ok: false };
    }
    return { status: res.status >= 500 ? 502 : 401, ok: false };
  } catch (err) {
    console.error("google sign-in: token exchange failed", err instanceof Error ? err.message : err);
    return { status: 502, ok: false };
  }
}

/** Holds Google's ID token while someone Google vouched for, with no organisation yet, fills in /sign-up. */
export const GOOGLE_SIGN_UP_COOKIE = "orblode_google_sign_up";

/** Shorter than the hour Google's ID token lasts, so the token is still good when the form comes back. */
export const GOOGLE_SIGN_UP_SECONDS = 30 * 60;

export interface GoogleSignUp {
  token: string;
  name: string;
  email: string;
}

/**
 * The sign-up Google started, or null when there is none or its token has expired. The token came from Google's
 * token endpoint, so its claims are read here for display only; user-svc verifies it again when the form is sent.
 */
export async function pendingGoogleSignUp(): Promise<GoogleSignUp | null> {
  const token = (await cookies()).get(GOOGLE_SIGN_UP_COOKIE)?.value;
  const claims = token ? decodeClaims(token) : null;
  if (!token || !claims || typeof claims.email !== "string" || typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
  return { token, email: claims.email.toLowerCase(), name: typeof claims.name === "string" ? claims.name : "" };
}

function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}
