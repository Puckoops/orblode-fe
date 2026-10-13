import { NextResponse, type NextRequest } from "next/server";
import { accountPost } from "@/lib/account";
import { userSvcBase } from "@/lib/session";
import { failure, signIn } from "../shared";

const GONE = "This invitation is no longer valid. Ask whoever sent it for a new one.";

interface Accepted {
  email: string;
  organisation: string;
  client_id?: string;
}

/** What the invitation's link opens: whose organisation, for which email, from whom. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!token) return failure({ status: 404, ok: false }, { 404: GONE });
  try {
    const res = await fetch(`${userSvcBase()}/orblode/invitations/${encodeURIComponent(token)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string; data?: unknown } | null;
    if (!res.ok || !json || json.error) return failure({ status: res.status, ok: false, message: json?.message }, { 404: GONE });
    return NextResponse.json({ status: 200, error: false, data: json.data });
  } catch {
    return failure({ status: 502, ok: false }, {});
  }
}

/** Accepts the invitation, setting up the account, then signs the person in to the organisation that invited them. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const reply = await accountPost<Accepted>("/orblode/invitations/accept", { token: body?.token, name: body?.name, password });
  if (!reply.ok || !reply.data?.email) {
    return failure(reply.ok ? { status: 502, ok: false } : reply, {
      400: "Check your name and password: the password needs 8+ characters, with upper and lower case, a digit and a symbol.",
      404: GONE,
      409: "You already have an account with this email. Enter its password to join.",
    });
  }
  return signIn(reply.data.email, password, false, reply.data.client_id);
}
