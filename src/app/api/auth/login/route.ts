import { normalizeEmail } from "@/lib/email";
import { methodNotAllowed, signIn } from "../shared";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  return signIn(email, body?.password, body?.remember === true);
}

export const GET = methodNotAllowed;
