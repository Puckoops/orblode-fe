import { type NextRequest } from "next/server";
import { orblodeSvcBase } from "@/lib/session";
import { forward } from "../../forward";

async function handle(request: NextRequest, ctx: RouteContext<"/api/orblode/[...path]">) {
  return forward(request, orblodeSvcBase(), (await ctx.params).path);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
