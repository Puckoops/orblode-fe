import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "orblode_session";
const PROTECTED = ["/globe", "/viewer", "/upload", "/files", "/settings"];
const SIGNED_OUT_ONLY = ["/sign-in", "/sign-up"];
const FILES_PREFIX = "/files/";
// Ranges and conditional GETs keep tile and point-cloud streaming cheap; nothing else of the browser's reaches orblode-svc.
const FILE_REQUEST_HEADERS = ["accept", "range", "if-none-match", "if-modified-since", "if-range"];

const matches = (pathname: string, routes: string[]) => routes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Presence checks only: the backends verify the token on every request. Stored artifacts are
 * served same-origin as /files/<key>, rewritten here to orblode-svc's files proxy with the
 * session's bearer, which is what lets Cesium's WebGL loads read them without bucket CORS.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname.startsWith(FILES_PREFIX)) {
    if (!token) return NextResponse.json({ status: 401, error: true, message: "Not signed in" }, { status: 401 });
    const base = process.env.ORBLODE_SVC_URL?.replace(/\/+$/, "");
    if (!base) return NextResponse.json({ status: 500, error: true, message: "ORBLODE_SVC_URL is not set" }, { status: 500 });
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    for (const name of FILE_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return NextResponse.rewrite(new URL(`${base}${pathname}${search}`), { request: { headers } });
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(token ? "/globe" : "/sign-in", request.url));
  }

  if (matches(pathname, PROTECTED) && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (matches(pathname, SIGNED_OUT_ONLY) && token) {
    return NextResponse.redirect(new URL("/globe", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/globe", "/viewer/:path*", "/upload", "/files", "/files/:path*", "/settings", "/sign-in", "/sign-up"],
};
