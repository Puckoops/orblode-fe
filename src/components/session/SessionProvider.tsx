"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Profile } from "@/lib/profile";

const SessionContext = createContext<Profile | null>(null);

/** Hands the signed-in profile, read from the session on the server, to client components. */
export function SessionProvider({ profile, children }: { profile: Profile | null; children: ReactNode }) {
  return <SessionContext.Provider value={profile}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
