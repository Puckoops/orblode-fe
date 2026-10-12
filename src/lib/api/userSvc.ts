import { ApiError, apiFetch, USERS_API } from "@/lib/api/client";
import { readBody } from "@/lib/api/envelope";
import type { Profile } from "@/lib/profile";

// user-svc, through /api/users: identity, and Orblode's workspaces and projects under /orblode/*.

export type LoginResponse = Profile;

export interface Project {
  id: string;
  client_id: string;
  /** Empty for a project from before workspaces that has not been filed yet. */
  workspace_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  lifecycle_status: string;
  center_lat: number | null;
  center_lng: number | null;
  center_height: number | null;
  location_name: string | null;
  crs_epsg: number | null;
  crs_label: string | null;
  crs_units: string | null;
  vertical_datum: string | null;
  primary_material: string | null;
  created_at: string;
  updated_at: string;
}

/** Signs in through the BFF, which keeps the token in an httpOnly cookie and answers with who signed in. */
export async function login(email: string, password: string, remember = false): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(502, "We couldn't reach Orblode. Check your connection and try again.");
  }
  return readBody<LoginResponse>(res.status, res.ok, await res.text());
}

/** Someone Google vouched for who belongs to no organisation yet: /sign-up?via=google finishes it. */
export interface NeedsOrganisation {
  needs_organisation: true;
}

/** Signs in through the BFF with the code from Google's popup, as login does with a password. */
export async function loginWithGoogle(code: string, remember = false): Promise<LoginResponse | NeedsOrganisation> {
  let res: Response;
  try {
    res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, remember }),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(502, "We couldn't reach Orblode. Check your connection and try again.");
  }
  return readBody<LoginResponse | NeedsOrganisation>(res.status, res.ok, await res.text());
}

/** A workspace's sites, or without one every site of the client. */
export function listProjects(workspaceId?: string): Promise<Project[]> {
  const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
  return apiFetch<Project[]>(USERS_API, `/orblode/projects${query}`);
}

export function getProject(id: string): Promise<Project> {
  return apiFetch<Project>(USERS_API, `/orblode/projects/${encodeURIComponent(id)}`);
}

/** Body for POST /orblode/projects. Geo/CRS fields are optional; orblode-svc snapshots crs_epsg and
 * vertical_datum onto each new survey as its working CRS. */
export interface CreateProjectRequest {
  /** Without one the site goes to the client's default workspace. */
  workspace_id?: string;
  name: string;
  description?: string;
  location_name?: string;
  crs_epsg?: number;
  crs_label?: string;
  vertical_datum?: string;
  primary_material?: string;
}

export function createProject(req: CreateProjectRequest): Promise<Project> {
  return apiFetch<Project>(USERS_API, "/orblode/projects", { method: "POST", body: req });
}

/** People in a workspace, and the client's org admins, see it and every site in it. */
export interface Workspace {
  id: string;
  client_id: string;
  name: string;
  description: string;
  user_ids: string[];
  is_default: boolean;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  user_id: string;
  /** Absent for an account that no longer resolves. */
  name?: string;
  email?: string;
}

/** Someone in the signed-in client, from GET /orblode/users. */
export interface OrgPerson {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
}

/** The caller's workspaces, every one of the client's for an org admin; the default first. */
export function listWorkspaces(): Promise<Workspace[]> {
  return apiFetch<Workspace[]>(USERS_API, "/orblode/workspaces");
}

export function createWorkspace(req: { name: string; description?: string; user_ids?: string[] }): Promise<Workspace> {
  return apiFetch<Workspace>(USERS_API, "/orblode/workspaces", { method: "POST", body: req });
}

export function updateWorkspace(id: string, change: { name?: string; description?: string }): Promise<Workspace> {
  return apiFetch<Workspace>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}`, { method: "PUT", body: change });
}

/** Refused (409) for the default workspace and for one that still has sites. */
export async function deleteWorkspace(id: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function listWorkspaceMembers(id: string): Promise<WorkspaceMember[]> {
  return apiFetch<WorkspaceMember[]>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}/members`);
}

export function addWorkspaceMembers(id: string, userIds: string[]): Promise<Workspace> {
  return apiFetch<Workspace>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}/members`, { method: "POST", body: { user_ids: userIds } });
}

/** Also revokes the person's roles on the workspace's sites. */
export async function removeWorkspaceMember(id: string, userId: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

/** The people with roles on the site join the new workspace. */
export function moveProject(projectId: string, workspaceId: string): Promise<Project> {
  return apiFetch<Project>(USERS_API, `/orblode/projects/${encodeURIComponent(projectId)}/workspace`, {
    method: "PUT",
    body: { workspace_id: workspaceId },
  });
}

export function listOrgPeople(): Promise<OrgPerson[]> {
  return apiFetch<OrgPerson[]>(USERS_API, "/orblode/users");
}
