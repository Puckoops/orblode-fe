import { NextResponse } from "next/server";
import { accountPost } from "@/lib/account";
import { failure, methodNotAllowed } from "../../shared";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const reply = await accountPost("/user/password-reset/confirm", { token: body?.token, new_password: body?.new_password });
  if (!reply.ok) {
    return failure(reply, {
      404: "This reset link has expired or was already used. Ask for a new one.",
      410: "This reset link has expired or was already used. Ask for a new one.",
    });
  }
  return NextResponse.json({ status: 200, error: false });
}

export const GET = methodNotAllowed;
