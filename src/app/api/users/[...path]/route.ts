import { type NextRequest } from "next/server";
import { userSvcBase } from "@/lib/session";
import { forward } from "../../forward";

// Orblode's domain endpoints and the directory; the account flows have their own handlers under /api/auth.
const ALLOWED_ROOTS = new Set(["orblode", "users"]);

async function handle(request: NextRequest, ctx: RouteContext<"/api/users/[...path]">) {
  const { path } = await ctx.params;
  return forward(request, userSvcBase(), path, (segments) => ALLOWED_ROOTS.has(segments[0] ?? ""));
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
