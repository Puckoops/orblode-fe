import { NextResponse } from "next/server";
import type { Reply } from "@/lib/account";
import { profileFromLogin, type LoginReply } from "@/lib/profile";
import { PROFILE_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { failure } from "../shared";

export type Login = LoginReply;

/** user-svc's 403 for an account Google vouched for that belongs to no organisation, as opposed to an inactive one. */
export const isWithoutOrganisation = (reply: Reply<unknown>) =>
  reply.status === 403 && reply.message === "this account is not a member of any Orblode organisation";

/** Answers a user-svc /user/oauth reply: the session and profile cookies on success, Orblode's words otherwise. */
export function googleSession(reply: Reply<Login>, remember: boolean) {
  const profile = reply.ok ? profileFromLogin(reply.data) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "Google sign-in isn't available right now. Sign in with your email instead.",
      401: "Google couldn't confirm it's you. Try again.",
      403: "This Google account can't sign in to Orblode. Ask your organisation's admin about it.",
      409: "This email is linked to a different Google account. Sign in with your email and password instead.",
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
