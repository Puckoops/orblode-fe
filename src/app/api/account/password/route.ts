import { NextResponse } from "next/server";
import { failure, methodNotAllowed } from "@/app/api/auth/shared";
import { parseProfile } from "@/lib/profile";
import { PRODUCT, PROFILE_COOKIE, renewedCookieOptions, SESSION_COOKIE } from "@/lib/session";
import { asSignedIn } from "../shared";

interface Login {
  token: string;
  expire_at: number;
  user: unknown;
  client: unknown;
  membership?: unknown;
}

/**
 * Changes the signed-in person's password. user-svc ends every other session and answers a new
 * token for this one, which replaces the old: the old one stops working.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const reply = await asSignedIn<Login>("POST", () => "/user/password/change", {
    current_password: typeof body?.current_password === "string" ? body.current_password : "",
    new_password: typeof body?.new_password === "string" ? body.new_password : "",
    type: PRODUCT,
  });
  const profile = reply.ok ? parseProfile(JSON.stringify({ user: reply.data?.user, client: reply.data?.client, membership: reply.data?.membership })) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      401: "Sign in again to change your password.",
      403: "Sign in again, then change your password.",
      404: "Changing your password isn't available yet.",
      429: "Too many attempts. Wait a few minutes, then try again.",
    });
  }
  const options = await renewedCookieOptions(reply.data.expire_at);
  const response = NextResponse.json({ status: 200, error: false });
  response.cookies.set(SESSION_COOKIE, reply.data.token, options);
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), options);
  return response;
}

export const GET = methodNotAllowed;
