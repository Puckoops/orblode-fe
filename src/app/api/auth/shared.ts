import { NextResponse } from "next/server";
import { accountPost, type Reply } from "@/lib/account";
import { profileFromLogin, type LoginReply } from "@/lib/profile";
import { PROFILE_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, sessionCookieOptions, userSvcBase } from "@/lib/session";

/**
 * Signs in at user-svc and answers the browser with the session cookies set, or with why it failed.
 * With clientId, the session opens that organisation rather than the one used last, when the person
 * is in it.
 */
export async function signIn(email: string, password: unknown, remember: boolean, clientId?: string) {
  let reply = await accountPost<LoginReply>("/user/login", { email, password });
  if (reply.ok && reply.data?.token && clientId && profileFromLogin(reply.data)?.client.id !== clientId) {
    const switched = await switchClient(reply.data.token, clientId);
    if (switched.ok) reply = switched;
  }
  const profile = reply.ok ? profileFromLogin(reply.data) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "Invalid email or password.",
      401: "Invalid email or password.",
      403: "Confirm your email before signing in: open the link we sent you, or send a new one.",
      429: "Too many attempts. Wait a few minutes, then try again.",
    });
  }
  const options = sessionCookieOptions(remember ? reply.data.expire_at : undefined);
  const response = NextResponse.json({ status: 200, error: false, data: profile });
  response.cookies.set(SESSION_COOKIE, reply.data.token, options);
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), options);
  if (remember) response.cookies.set(REMEMBER_COOKIE, "1", options);
  else response.cookies.delete(REMEMBER_COOKIE);
  return response;
}

/** Re-issues the session behind token for another organisation the person is in. */
export async function switchClient(token: string, clientId: string): Promise<Reply<LoginReply>> {
  try {
    const res = await fetch(`${userSvcBase()}/orblode/session/client`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ client_id: clientId }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string; data?: LoginReply } | null;
    return { status: res.status, ok: res.ok && !!json && !json.error, message: json?.message, data: json?.data };
  } catch {
    return { status: 502, ok: false };
  }
}

/** Answers the browser for a user-svc call that failed, in Orblode's words where there are some for that status. */
export function failure(reply: Reply<unknown>, messages: Partial<Record<number, string>>) {
  const status = reply.status >= 400 ? reply.status : 502;
  const fallback = status >= 500 ? "Something went wrong. Try again in a moment." : reply.message;
  return NextResponse.json({ status, error: true, message: messages[status] ?? fallback ?? "That didn't work. Try again." }, { status });
}

export function clearSession(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(PROFILE_COOKIE);
  response.cookies.delete(REMEMBER_COOKIE);
  return response;
}

export function methodNotAllowed() {
  return NextResponse.json({ status: 405, error: true, message: "Use POST" }, { status: 405 });
}
