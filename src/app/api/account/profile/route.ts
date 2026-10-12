import { NextResponse } from "next/server";
import { failure } from "@/app/api/auth/shared";
import { PROFILE_COOKIE, renewedCookieOptions, sessionProfile, sessionToken, tokenExpiry } from "@/lib/session";
import { asSignedIn } from "../shared";

interface Me {
  name: string;
  avatar_url?: string;
}

/**
 * Changes the signed-in person's name or avatar in user-svc (PUT /user/:id), then the profile
 * cookie the app shows them from. An empty avatar_url removes the avatar.
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const change: { name?: string; avatar_url?: string } = {};
  if (typeof body?.name === "string") change.name = body.name.trim();
  if (typeof body?.avatar_url === "string") change.avatar_url = body.avatar_url;
  if (Object.keys(change).length === 0) {
    return NextResponse.json({ status: 400, error: true, message: "Nothing to change." }, { status: 400 });
  }
  const reply = await asSignedIn<Me>("PUT", (id) => `/user/${encodeURIComponent(id)}`, change);
  const profile = await sessionProfile();
  if (!reply.ok || !reply.data || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: reply.message ?? "That can't be saved.",
      401: "Sign in again to change your account.",
    });
  }
  const next = { ...profile, user: { ...profile.user, name: reply.data.name, avatar_url: reply.data.avatar_url || undefined } };
  const response = NextResponse.json({ status: 200, error: false, data: reply.data });
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(next), await renewedCookieOptions(tokenExpiry((await sessionToken()) ?? "")));
  return response;
}
