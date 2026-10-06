import { NextResponse } from "next/server";
import { accountPost } from "@/lib/account";
import { normalizeEmail } from "@/lib/email";
import { parseProfile } from "@/lib/profile";
import { PROFILE_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { failure, methodNotAllowed } from "../shared";

interface Login {
  token: string;
  expire_at: number;
  user: unknown;
  client: unknown;
  membership?: unknown;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const reply = await accountPost<Login>("/user/login", { email, password: body?.password });
  const profile = reply.ok ? parseProfile(JSON.stringify({ user: reply.data?.user, client: reply.data?.client, membership: reply.data?.membership })) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "Invalid email or password.",
      401: "Invalid email or password.",
      403: "Confirm your email before signing in: open the link we sent you, or send a new one.",
      429: "Too many attempts. Wait a few minutes, then try again.",
    });
  }
  const options = sessionCookieOptions(body?.remember === true ? reply.data.expire_at : undefined);
  const response = NextResponse.json({ status: 200, error: false, data: profile });
  response.cookies.set(SESSION_COOKIE, reply.data.token, options);
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), options);
  return response;
}

export const GET = methodNotAllowed;
