import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/account";
import { clearSession } from "../shared";

/** Where a page lands when a backend rejects the stored token: clear it, then sign in again. */
export function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next") ?? "/globe");
  const signIn = new URL("/sign-in", request.url);
  if (next) signIn.searchParams.set("next", next);
  return clearSession(NextResponse.redirect(signIn));
}
