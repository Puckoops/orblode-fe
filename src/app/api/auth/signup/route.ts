import { NextResponse, type NextRequest } from "next/server";
import { accountPost, pageUrl, safeNext } from "@/lib/account";
import { normalizeEmail } from "@/lib/email";
import { failure, methodNotAllowed } from "../shared";

const FIELDS = ["name", "password", "domain", "phone", "address", "city", "state", "zip", "country", "company_name", "company_role"] as const;

/** Creates an Orblode organisation with the caller as its owner. A new account signs in once its address is confirmed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload: Record<string, unknown> = {};
  for (const key of FIELDS) payload[key] = typeof body?.[key] === "string" ? (key === "password" ? body[key] : (body[key] as string).trim()) : "";
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
