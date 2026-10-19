import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "orblode_session";
const PROTECTED = ["/globe", "/viewer", "/upload", "/files", "/reports", "/settings", "/mm"];
const SIGNED_OUT_ONLY = ["/sign-in", "/sign-up"];
const FILES_PREFIX = "/files/";
const SHOWCASE_FILES_PREFIX = "/showcase/files/";
// Ranges and conditional GETs keep tile and point-cloud streaming cheap; nothing else of the browser's reaches orblode-svc.
const FILE_REQUEST_HEADERS = ["accept", "range", "if-none-match", "if-modified-since", "if-range"];

const matches = (pathname: string, routes: string[]) => routes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

function fileRequestHeaders(request: NextRequest) {
  const headers = new Headers();
  for (const name of FILE_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

const svcBase = () => process.env.ORBLODE_SVC_URL?.replace(/\/+$/, "");
const noSvc = () => NextResponse.json({ status: 500, error: true, message: "ORBLODE_SVC_URL is not set" }, { status: 500 });

/**
 * Presence checks only: the backends verify the token on every request. Stored artifacts are
 * served same-origin as /files/<key>, rewritten here to orblode-svc's files proxy with the
 * session's bearer, which is what lets Cesium's WebGL loads read them without bucket CORS.
 * The landing page's showcase survey is served the same way from /showcase/files/<key>, with no
 * session; orblode-svc only answers for keys that belong to a flagged survey.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname.startsWith(SHOWCASE_FILES_PREFIX)) {
    const base = svcBase();
    if (!base) return noSvc();
    return NextResponse.rewrite(new URL(`${base}${pathname}${search}`), { request: { headers: fileRequestHeaders(request) } });
  }

  if (pathname.startsWith(FILES_PREFIX)) {
    if (!token) return NextResponse.json({ status: 401, error: true, message: "Not signed in" }, { status: 401 });
    const base = svcBase();
    if (!base) return noSvc();
    const headers = fileRequestHeaders(request);
    headers.set("Authorization", `Bearer ${token}`);
    return NextResponse.rewrite(new URL(`${base}${pathname}${search}`), { request: { headers } });
  }

  if (pathname === "/") {
    return token ? NextResponse.redirect(new URL("/globe", request.url)) : NextResponse.next();
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
  matcher: ["/", "/globe", "/viewer/:path*", "/upload", "/files", "/files/:path*", "/showcase/files/:path*", "/reports", "/settings", "/mm", "/mm/:path*", "/sign-in", "/sign-up"],
};
