import { create } from "zustand";
import { listProjects } from "@/lib/api/userSvc";

interface SiteNamesState {
  names: Record<string, string>;
  /** Each site's workspace id. */
  workspaces: Record<string, string>;
  /** Loads the client's sites unless every id is already named. */
  ensure: (projectIds: string[]) => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useSiteNames = create<SiteNamesState>((set, get) => ({
  names: {},
  workspaces: {},
  ensure: (projectIds) => {
    if (projectIds.every((id) => id in get().names)) return Promise.resolve();
    inFlight ??= listProjects()
      .then((projects) =>
        set({
          names: Object.fromEntries(projects.map((p) => [p.id, p.name])),
          workspaces: Object.fromEntries(projects.map((p) => [p.id, p.workspace_id])),
        }),
      )
      .catch(() => {
        // Notices show without their site's name.
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
}));
