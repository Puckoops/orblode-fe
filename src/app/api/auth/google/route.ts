import { NextResponse } from "next/server";
import { accountPost } from "@/lib/account";
import { GOOGLE_SIGN_UP_COOKIE, GOOGLE_SIGN_UP_SECONDS, googleIdToken } from "@/lib/google";
import { sessionCookieOptions } from "@/lib/session";
import { failure, methodNotAllowed } from "../shared";
import { googleSession, isWithoutOrganisation, type Login } from "./session";

/**
 * Signs in with the code from Google's popup. Someone with no organisation gets `needs_organisation` instead,
 * and the ID token waits in a short-lived cookie for /sign-up to create one.
 */
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
  if (isWithoutOrganisation(reply)) {
    const response = NextResponse.json({ status: 200, error: false, data: { needs_organisation: true } });
    response.cookies.set(GOOGLE_SIGN_UP_COOKIE, exchange.data, { ...sessionCookieOptions(), maxAge: GOOGLE_SIGN_UP_SECONDS });
    return response;
  }
  return googleSession(reply, body?.remember === true);
}

export const GET = methodNotAllowed;
