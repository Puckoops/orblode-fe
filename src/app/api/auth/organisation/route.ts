import { NextResponse } from "next/server";
import { profileFromLogin } from "@/lib/profile";
import { PROFILE_COOKIE, renewedCookieOptions, SESSION_COOKIE, sessionToken } from "@/lib/session";
import { failure, methodNotAllowed, switchClient } from "../shared";

/** Moves the signed-in person's session to another organisation they are in, and answers that organisation. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const clientId = typeof body?.client_id === "string" ? body.client_id : "";
  const token = await sessionToken();
  const reply = token ? await switchClient(token, clientId) : { status: 401, ok: false };
  const profile = reply.ok ? profileFromLogin(reply.data) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "That organisation couldn't be opened.",
      401: "Sign in again to switch organisation.",
      403: "You're no longer in that organisation.",
    });
  }
  const options = await renewedCookieOptions(reply.data.expire_at);
  const response = NextResponse.json({ status: 200, error: false, data: profile.client });
  response.cookies.set(SESSION_COOKIE, reply.data.token, options);
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), options);
  return response;
}

export const GET = methodNotAllowed;
