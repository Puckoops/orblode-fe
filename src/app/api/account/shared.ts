import "server-only";
import type { Reply } from "@/lib/account";
import { sessionProfile, sessionToken, userSvcBase } from "@/lib/session";

/** A call to user-svc as the signed-in person, or a 401 reply when no one is. */
export async function asSignedIn<T>(method: string, path: (userId: string) => string, body: unknown): Promise<Reply<T>> {
  const [token, profile] = await Promise.all([sessionToken(), sessionProfile()]);
  if (!token || !profile) return { status: 401, ok: false, message: "Sign in again to change your account." };
  try {
    const res = await fetch(`${userSvcBase()}${path(profile.user.id)}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string; data?: T } | null;
    return { status: res.status, ok: res.ok && !!json && !json.error, message: json?.message, data: json?.data };
  } catch {
    return { status: 502, ok: false };
  }
}
