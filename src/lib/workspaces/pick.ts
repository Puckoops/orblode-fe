import type { Project, Workspace } from "../api/userSvc.ts";

/** The workspace to open: the one remembered if the person still sees it, else the default, else the first. */
export function pickWorkspace(workspaces: Workspace[], remembered: string | null): string {
  if (remembered && workspaces.some((w) => w.id === remembered)) return remembered;
  return (workspaces.find((w) => w.is_default) ?? workspaces[0])?.id ?? "";
}

/** The items that belong to one of the sites; none while the sites are still loading. */
export function inSites<T extends { project_id: string }>(items: T[], sites: Pick<Project, "id">[] | null): T[] {
  if (!sites) return [];
  const ids = new Set(sites.map((p) => p.id));
  return items.filter((item) => ids.has(item.project_id));
}

/** The workspace a site lives in, when it is another one the person sees; null otherwise. */
export function workspaceToFollow(project: Pick<Project, "workspace_id">, workspaces: Workspace[] | null, currentId: string): string | null {
  const id = project.workspace_id;
  if (!id || id === currentId || !workspaces?.some((w) => w.id === id)) return null;
  return id;
}
