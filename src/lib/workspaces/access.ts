import { create } from "zustand";
import { useEffect } from "react";
import { MINOR_MINERALS, useMinorMinerals } from "@/hooks/useMinorMinerals";
import {
  getWorkspacePermissions,
  type WorkspaceAccessSummary,
} from "@/lib/api/userSvc";
import { modeOf, type MMMode } from "@/lib/mm/roleHome";
import { useOrganisation } from "@/lib/organisation/store";
import { useCurrentWorkspace, useWorkspaces } from "./store";

interface WorkspaceAccessState {
  /** By workspace: its summary, null when user-svc sent none or couldn't answer. Absent until loaded. */
  byWorkspace: Record<string, WorkspaceAccessSummary | null>;
  load: (workspaceId: string) => Promise<void>;
}

export const useWorkspaceAccessStore = create<WorkspaceAccessState>(
  (set, get) => ({
    byWorkspace: {},
    load: async (workspaceId) => {
      let summary: WorkspaceAccessSummary | null = null;
      try {
        summary = (await getWorkspacePermissions(workspaceId)).summary ?? null;
      } catch {
        // Without a summary everyone keeps the planner's rail; the services still refuse what isn't allowed.
      }
      set({ byWorkspace: { ...get().byWorkspace, [workspaceId]: summary } });
    },
  }),
);

/** The current workspace's access summary: undefined while it loads, null when there is none. */
export function useWorkspaceAccess():
  WorkspaceAccessSummary | null | undefined {
  const id = useWorkspaces((s) => s.currentId);
  const summary = useWorkspaceAccessStore((s) =>
    id ? s.byWorkspace[id] : null,
  );
  const load = useWorkspaceAccessStore((s) => s.load);
  const loaded = useWorkspaceAccessStore((s) =>
    id ? id in s.byWorkspace : true,
  );
  useEffect(() => {
    if (id && !loaded) void load(id);
  }, [id, loaded, load]);
  return summary;
}

/** How the person works in the current workspace: null while that's still loading; a planner outside minor minerals. */
export function useMMMode(): MMMode | null {
  const minorMinerals = useMinorMinerals();
  const workspacesLoaded = useWorkspaces((s) => s.workspaces !== null);
  const typedMM = useCurrentWorkspace()?.type === MINOR_MINERALS;
  const organisationLoaded = useOrganisation((s) => s.organisation !== null);
  const summary = useWorkspaceAccess();
  if (!workspacesLoaded || (typedMM && !organisationLoaded)) return null;
  if (!minorMinerals) return "planner";
  if (summary === undefined) return null;
  return modeOf(summary);
}
