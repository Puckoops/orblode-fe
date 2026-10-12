import { create } from "zustand";
import { listProjects, listWorkspaces, type Project, type Workspace } from "@/lib/api/userSvc";
import { pickWorkspace, workspaceToFollow } from "./pick";

interface WorkspacesState {
  clientId: string;
  /** The person's workspaces; null until loaded. */
  workspaces: Workspace[] | null;
  /** True when user-svc could not list them: every site of the client shows, with no switcher. */
  unavailable: boolean;
  currentId: string;
  /** The current workspace's active sites; null while they load. */
  sites: Project[] | null;
  /** Loads the client's workspaces, opening the one this browser last used; again only after a failure. */
  load: (clientId: string) => Promise<void>;
  select: (id: string) => Promise<void>;
  /** Reads the workspaces and the current one's sites again, after a change to either. */
  refresh: () => Promise<void>;
  /** Switches to the site's workspace when it is another one the person sees; says whether it did. */
  follow: (site: Pick<Project, "workspace_id">) => boolean;
}

const rememberKey = (clientId: string) => `orblode.workspace.${clientId}`;

function remembered(clientId: string): string | null {
  try {
    return localStorage.getItem(rememberKey(clientId));
  } catch {
    return null;
  }
}

function remember(clientId: string, id: string) {
  try {
    localStorage.setItem(rememberKey(clientId), id);
  } catch {
    // Without storage the default workspace opens next time.
  }
}

// Each sites load takes a number, so a slow answer for a workspace left behind never lands.
let sitesRequest = 0;
// Both layouts mount the loader; the second asks while the first is still reading.
let loading: { clientId: string; done: Promise<void> } | null = null;

export const useWorkspaces = create<WorkspacesState>((set, get) => {
  const loadSites = async (workspaceId: string | null) => {
    const request = ++sitesRequest;
    set({ sites: null });
    if (workspaceId === "") {
      set({ sites: [] });
      return;
    }
    try {
      const sites = await listProjects(workspaceId ?? undefined);
      if (request === sitesRequest) set({ sites });
    } catch (err) {
      console.error("Failed to fetch the workspace's sites:", err);
      if (request === sitesRequest) set({ sites: [] });
    }
  };

  const readWorkspaces = async (prefer: string | null) => {
    try {
      const workspaces = await listWorkspaces();
      const currentId = pickWorkspace(workspaces, prefer);
      set({ workspaces, currentId, unavailable: false });
      if (currentId) remember(get().clientId, currentId);
      await loadSites(currentId);
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
      set({ workspaces: [], currentId: "", unavailable: true });
      await loadSites(null);
    }
  };

  return {
    clientId: "",
    workspaces: null,
    unavailable: false,
    currentId: "",
    sites: null,

    load: (clientId) => {
      if (loading?.clientId === clientId) return loading.done;
      if (get().clientId === clientId && get().workspaces && !get().unavailable) return Promise.resolve();
      set({ clientId, workspaces: null, unavailable: false, currentId: "", sites: null });
      const done = readWorkspaces(remembered(clientId)).finally(() => {
        if (loading?.done === done) loading = null;
      });
      loading = { clientId, done };
      return done;
    },

    select: async (id) => {
      if (id === get().currentId) return;
      set({ currentId: id });
      remember(get().clientId, id);
      await loadSites(id);
    },

    refresh: () => readWorkspaces(get().currentId),

    follow: (site) => {
      const id = workspaceToFollow(site, get().workspaces, get().currentId);
      if (id) void get().select(id);
      return id !== null;
    },
  };
});

/** The current workspace, once loaded. */
export function useCurrentWorkspace(): Workspace | null {
  return useWorkspaces((s) => s.workspaces?.find((w) => w.id === s.currentId) ?? null);
}

const NO_SITES: Project[] = [];

/** The current workspace's sites, empty while they load. */
export function useWorkspaceSites(): Project[] {
  return useWorkspaces((s) => s.sites) ?? NO_SITES;
}
