import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail } from "@/lib/email";
import { orblodeSvcBase } from "@/lib/session";
import { methodNotAllowed } from "../auth/shared";

const FIELDS = ["name", "email", "company", "message", "website"] as const;

const reply = (status: number, message: string) => NextResponse.json({ status, error: true, message }, { status });

/**
 * Public: hands a demo request from the landing page to orblode-svc. The visitor's address goes
 * along as X-Forwarded-For so the service's rate limit counts each person, not this server.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const payload: Record<string, string> = { source: "landing" };
  for (const key of FIELDS) payload[key] = typeof body?.[key] === "string" ? (body[key] as string).trim() : "";
  payload.email = normalizeEmail(payload.email);

  const headers = new Headers({ "content-type": "application/json" });
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  let res: Response;
  try {
    res = await fetch(`${orblodeSvcBase()}/leads`, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store" });
  } catch (err) {
    console.error("lead request failed", err instanceof Error ? err.message : err);
    return reply(502, "We couldn't send that just now. Try again, or email contact@orblode.com.");
  }

  const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string } | null;
  if (res.ok && json && !json.error) return NextResponse.json({ status: 201, error: false }, { status: 201 });
  if (res.status === 429) return reply(429, "You've sent a few requests already. Try again in a few minutes.");
  if (res.status === 400) return reply(400, json?.message ?? "Check the form and try again.");
  return reply(502, "We couldn't send that just now. Try again, or email contact@orblode.com.");
}

export const GET = methodNotAllowed;
