import { NextResponse } from "next/server";
import { accountPost, type Reply } from "@/lib/account";
import { parseProfile } from "@/lib/profile";
import { PROFILE_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

interface Login {
  token: string;
  expire_at: number;
  user: unknown;
  client: unknown;
  membership?: unknown;
}

/** Signs in at user-svc and answers the browser with the session cookies set, or with why it failed. */
export async function signIn(email: string, password: unknown, remember: boolean) {
  const reply = await accountPost<Login>("/user/login", { email, password });
  const profile = reply.ok ? parseProfile(JSON.stringify({ user: reply.data?.user, client: reply.data?.client, membership: reply.data?.membership })) : null;
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
