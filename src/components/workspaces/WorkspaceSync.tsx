"use client";

import { useEffect } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { useWorkspaces } from "@/lib/workspaces/store";

/** Loads the signed-in client's workspaces for every signed-in page. */
export function WorkspaceSync() {
  const clientId = useAuthClient()?.id;
  const load = useWorkspaces((s) => s.load);
  useEffect(() => {
    if (clientId) void load(clientId);
  }, [clientId, load]);
  return null;
}
