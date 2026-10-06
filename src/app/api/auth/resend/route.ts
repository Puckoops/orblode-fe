import { NextResponse, type NextRequest } from "next/server";
import { accountPost, pageUrl, safeNext } from "@/lib/account";
import { normalizeEmail } from "@/lib/email";
import { failure, methodNotAllowed } from "../shared";

/** Sends a fresh confirmation link. user-svc answers the same whether or not the address has an unconfirmed account. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const reply = await accountPost("/user/resend-verification", {
    email: typeof body?.email === "string" ? normalizeEmail(body.email) : "",
    verify_url: pageUrl(request.nextUrl.origin, "/verify", safeNext(body?.next)),
  });
  if (!reply.ok) return failure(reply, {});
  return NextResponse.json({ status: 200, error: false });
}

export const GET = methodNotAllowed;
