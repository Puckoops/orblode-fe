import { NextResponse } from "next/server";
import { accountPost } from "@/lib/account";
import { googleIdToken } from "@/lib/google";
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

/** Signs in with the code from Google's popup. The account has to belong to an organisation already. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ status: 400, error: true, message: "Google didn't send a sign-in. Try again." }, { status: 400 });
  }
  const exchange = await googleIdToken(code);
  if (!exchange.ok || !exchange.data) {
    return failure(exchange, {
      401: "Google couldn't confirm it's you. Try again.",
      503: "Google sign-in isn't available right now. Sign in with your email instead.",
    });
  }
  const reply = await accountPost<Login>("/user/oauth", { provider: "google", id_token: exchange.data });
  const profile = reply.ok ? parseProfile(JSON.stringify({ user: reply.data?.user, client: reply.data?.client, membership: reply.data?.membership })) : null;
  if (!reply.ok || !reply.data?.token || !profile) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "Google sign-in isn't available right now. Sign in with your email instead.",
      401: "Google couldn't confirm it's you. Try again.",
      403: "This Google account can't sign in to Orblode. If your organisation uses Orblode, ask its admin to add your email.",
      409: "This email is linked to a different Google account. Sign in with your email and password instead.",
    });
  }
  const options = sessionCookieOptions(body?.remember === true ? reply.data.expire_at : undefined);
  const response = NextResponse.json({ status: 200, error: false, data: profile });
  response.cookies.set(SESSION_COOKIE, reply.data.token, options);
  response.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), options);
  return response;
}

export const GET = methodNotAllowed;
