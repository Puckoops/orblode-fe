"use client";

import { useEffect } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { useOrganisation } from "@/lib/organisation/store";
import { useWorkspaces } from "@/lib/workspaces/store";

/** Loads the signed-in client's workspaces, and what the person may do in it, for every signed-in page. */
export function WorkspaceSync() {
  const clientId = useAuthClient()?.id;
  const load = useWorkspaces((s) => s.load);
  const loadOrganisation = useOrganisation((s) => s.load);
  useEffect(() => {
    if (!clientId) return;
    void load(clientId);
    void loadOrganisation(clientId);
  }, [clientId, load, loadOrganisation]);
  return null;
}
