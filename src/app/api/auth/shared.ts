import { NextResponse } from "next/server";
import type { Reply } from "@/lib/account";
import { PROFILE_COOKIE, SESSION_COOKIE } from "@/lib/session";

/** Answers the browser for a user-svc call that failed, in Orblode's words where there are some for that status. */
export function failure(reply: Reply<unknown>, messages: Partial<Record<number, string>>) {
  const status = reply.status >= 400 ? reply.status : 502;
  const fallback = status >= 500 ? "Something went wrong. Try again in a moment." : reply.message;
  return NextResponse.json({ status, error: true, message: messages[status] ?? fallback ?? "That didn't work. Try again." }, { status });
}

export function clearSession(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(PROFILE_COOKIE);
  return response;
}

export function methodNotAllowed() {
  return NextResponse.json({ status: 405, error: true, message: "Use POST" }, { status: 405 });
}
