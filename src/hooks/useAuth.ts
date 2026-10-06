"use client";

import { useSession } from "@/components/session/SessionProvider";
import type { AuthClient, AuthUser } from "@/lib/profile";

export { userInitials } from "@/lib/profile";

/** The signed-in person, as the login response named them; null outside a signed-in layout. */
export function useAuthUser(): AuthUser | null {
  return useSession()?.user ?? null;
}

/** The client (organisation) this session works in. */
export function useAuthClient(): AuthClient | null {
  return useSession()?.client ?? null;
}
