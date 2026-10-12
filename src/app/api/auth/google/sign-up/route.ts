import { accountPost } from "@/lib/account";
import { GOOGLE_SIGN_UP_COOKIE, pendingGoogleSignUp } from "@/lib/google";
import { organisationFields } from "@/lib/signUp";
import { failure, methodNotAllowed } from "../../shared";
import { googleSession, type Login } from "../session";

const EXPIRED = "Your Google sign-in has expired. Continue with Google again.";

/** Creates an organisation for the person Google vouched for at /api/auth/google, then signs them in. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const pending = await pendingGoogleSignUp();
  if (!pending) return failure({ status: 401, ok: false }, { 401: EXPIRED });

  const signUp = await accountPost("/orblode/clients/signup", { ...organisationFields(body), provider: "google", id_token: pending.token });
  if (!signUp.ok) {
    return failure(signUp, {
      401: EXPIRED,
      409: "This email already has an Orblode organisation, or is linked to a different Google account. Sign in instead.",
    });
  }
  const response = googleSession(await accountPost<Login>("/user/oauth", { provider: "google", id_token: pending.token }), false);
  response.cookies.delete(GOOGLE_SIGN_UP_COOKIE);
  return response;
}

export const GET = methodNotAllowed;
