import { NextResponse, type NextRequest } from "next/server";
import { orblodeSvcBase, SESSION_COOKIE } from "@/lib/session";

// The upstream stream ends after 10 minutes and the browser reconnects; a platform limit that cuts it
// sooner only means an earlier reconnect.
export const maxDuration = 300;

const reply = (status: number, message: string) => NextResponse.json({ status, error: true, message }, { status });

/**
 * orblode-svc's live notifications as the signed-in person. The catch-all forward reads a whole answer
 * before replying, which an event stream never finishes, so this route passes the body through as it
 * arrives. no-transform keeps compression from holding chunks back.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return reply(401, "Not signed in");

  let upstream: Response;
  try {
    upstream = await fetch(`${orblodeSvcBase()}/notifications/stream`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      cache: "no-store",
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return reply(499, "Request cancelled");
    console.error("notification stream failed", err instanceof Error ? err.message : err);
    return reply(502, "The service is unreachable. Try again in a moment.");
  }
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
