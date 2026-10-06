import { NextResponse, type NextRequest } from "next/server";
import { accountPost, pageUrl } from "@/lib/account";
import { normalizeEmail } from "@/lib/email";
import { failure, methodNotAllowed } from "../../shared";

/** Emails a reset link. user-svc answers 200 whether or not the address has an account. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const reply = await accountPost("/user/password-reset/request", {
    email: typeof body?.email === "string" ? normalizeEmail(body.email) : "",
    reset_url: pageUrl(request.nextUrl.origin, "/reset-password", null),
  });
  if (!reply.ok) return failure(reply, {});
  return NextResponse.json({ status: 200, error: false });
}

export const GET = methodNotAllowed;
