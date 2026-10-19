import { NextResponse, type NextRequest } from "next/server";
import { orblodeSvcBase } from "@/lib/session";

const PASSED_BACK = ["content-type", "content-length", "content-disposition", "cache-control", "x-robots-tag"];
const SHARE_PATH = /^shares\/[A-Za-z0-9_-]{20,128}(\/files\/[a-z0-9_]{1,40})?$/;

const reply = (status: number, message: string) => NextResponse.json({ status, error: true, message }, { status });

/** A shared report's summary and files, for /s/<token>: no session, no cookies, GET only. orblode-svc rate-limits and logs
 * by the visitor's address, so it is passed on. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/public/mm/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!SHARE_PATH.test(path)) return reply(404, "Not found");

  const headers = new Headers({ accept: request.headers.get("accept") ?? "*/*" });
  const visitor = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  if (visitor) headers.set("x-forwarded-for", visitor);
  const agent = request.headers.get("user-agent");
  if (agent) headers.set("user-agent", agent);

  let upstream: Response;
  try {
    upstream = await fetch(`${orblodeSvcBase()}/mm/public/${path}`, { headers, cache: "no-store", redirect: "manual", signal: request.signal });
  } catch (err) {
    if (request.signal.aborted) return reply(499, "Request cancelled");
    console.error("public share request failed", err instanceof Error ? err.message : err);
    return reply(502, "The service is unreachable. Try again in a moment.");
  }

  const out = new Headers();
  for (const name of PASSED_BACK) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}
