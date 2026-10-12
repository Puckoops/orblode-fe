import { NextResponse, type NextRequest } from "next/server";
import { PROFILE_COOKIE, REMEMBER_COOKIE, SESSION_COOKIE } from "@/lib/session";

const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "idempotency-key"];

const reply = (status: number, message: string) => NextResponse.json({ status, error: true, message }, { status });

/** Sends one browser request on to a backend as the signed-in person, and its answer back unchanged. */
export async function forward(request: NextRequest, base: string, path: string[], allowed?: (path: string[]) => boolean) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return reply(401, "Not signed in");
  if (path.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return reply(400, "Bad path");
  }
  if (allowed && !allowed(path)) return reply(404, "Not found");

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
  } catch (err) {
    if (request.signal.aborted) return reply(499, "Request cancelled");
    console.error("upstream request failed", err instanceof Error ? err.message : err);
    return reply(502, "The service is unreachable. Try again in a moment.");
  }

  const response = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  if (upstream.status === 401) {
    response.cookies.delete(SESSION_COOKIE);
    response.cookies.delete(PROFILE_COOKIE);
    response.cookies.delete(REMEMBER_COOKIE);
  }
  return response;
}
