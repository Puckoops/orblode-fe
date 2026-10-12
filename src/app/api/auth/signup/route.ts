import { NextResponse, type NextRequest } from "next/server";
import { accountPost, pageUrl, safeNext } from "@/lib/account";
import { normalizeEmail } from "@/lib/email";
import { organisationFields } from "@/lib/signUp";
import { failure, methodNotAllowed } from "../shared";

/** Creates an Orblode organisation with the caller as its owner. A new account signs in once its address is confirmed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload: Record<string, unknown> = { ...organisationFields(body), password: typeof body?.password === "string" ? body.password : "" };
  payload.email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  payload.verify_url = pageUrl(request.nextUrl.origin, "/verify", safeNext(body?.next));
  const reply = await accountPost("/orblode/clients/signup", payload);
  if (!reply.ok) {
    return failure(reply, {
      409: "An account with this email already exists and that password doesn't match it. Sign in, or use the account's password here.",
    });
  }
  return NextResponse.json({ status: 201, error: false, data: { email: payload.email } }, { status: 201 });
}

export const GET = methodNotAllowed;
