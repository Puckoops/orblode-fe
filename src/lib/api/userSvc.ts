import { ApiError, apiFetch, USERS_API } from "@/lib/api/client";
import { readBody } from "@/lib/api/envelope";
import type { OrganisationChoice } from "@/lib/organisation/links";
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
  center_lat?: number;
  center_lng?: number;
}

export function createProject(req: CreateProjectRequest): Promise<Project> {
  return apiFetch<Project>(USERS_API, "/orblode/projects", { method: "POST", body: req });
}

/** Writes only the fields sent. Needs can_manage_users on the project (its project managers and client admins). */
export function updateProject(id: string, change: Partial<Omit<CreateProjectRequest, "workspace_id">>): Promise<Project> {
  return apiFetch<Project>(USERS_API, `/orblode/projects/${encodeURIComponent(id)}`, { method: "PUT", body: change });
}

/** What a workspace is for: minor_minerals needs the organisation's extension. */
export type WorkspaceType = "general" | "minor_minerals";

/** A group of sites. A role on it reaches every site in it; the organisation's owners and admins manage them all. */
export interface Workspace {
  id: string;
  client_id: string;
  name: string;
  description: string;
  /** What the workspace listed before access moved to roles; no longer kept up to date. */
  user_ids: string[];
  is_default: boolean;
  /** Absent from a user-svc older than workspace types: general. */
  type?: WorkspaceType;
  project_count: number;
  /** Whether the signed-in person may rename it, delete it and change who has access. */
  can_manage: boolean;
  /** Whether the signed-in person may create sites in it: its admins and survey managers. */
  can_create_project: boolean;
  created_at: string;
  updated_at: string;
}

/** The workspaces the caller holds a role on, or holds a role on a site in; every one for an org admin. The default first. */
export function listWorkspaces(): Promise<Workspace[]> {
  return apiFetch<Workspace[]>(USERS_API, "/orblode/workspaces");
}

/** The caller becomes the workspace's admin. */
export function createWorkspace(req: { name: string; description?: string; user_ids?: string[]; type?: WorkspaceType }): Promise<Workspace> {
  return apiFetch<Workspace>(USERS_API, "/orblode/workspaces", { method: "POST", body: req });
}

export function updateWorkspace(id: string, change: { name?: string; description?: string; type?: WorkspaceType }): Promise<Workspace> {
  return apiFetch<Workspace>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}`, { method: "PUT", body: change });
}

/** Refused (409) for the default workspace and for one that still has sites. */
export async function deleteWorkspace(id: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Access through the old workspace goes and access through the new one comes; roles given on the site stay. */
export function moveProject(projectId: string, workspaceId: string): Promise<Project> {
  return apiFetch<Project>(USERS_API, `/orblode/projects/${encodeURIComponent(projectId)}/workspace`, {
    method: "PUT",
    body: { workspace_id: workspaceId },
  });
}

export type OrgRole = "owner" | "admin" | "member";
export type TeamRole = "maintainer" | "member";

/** What the signed-in person may do in their organisation, for showing controls; the server checks again. */
export interface OrgViewer {
  user_id: string;
  role: OrgRole;
  can_manage_people: boolean;
  can_manage_owners: boolean;
  can_create_teams: boolean;
  can_create_workspaces: boolean;
}

export interface MemberPrivileges {
  create_workspaces: boolean;
  create_teams: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  company_name?: string;
  member_privileges: MemberPrivileges;
  viewer: OrgViewer;
  /** Extensions switched on for the organisation, such as "minor_minerals". */
  extensions?: string[];
}

export interface OrgMember {
  user_id: string;
  /** Absent for an account that no longer resolves. */
  name?: string;
  email?: string;
  avatar_url?: string;
  role: OrgRole;
  teams: { id: string; name: string; role: TeamRole }[];
  is_verified: boolean;
  last_login_time?: string;
  joined_at: string;
}

export interface InviteRequest {
  email: string;
  role: OrgRole;
  team_ids: string[];
  /** The page the invitation's link opens; user-svc uses it only on an allowed origin. */
  invite_url?: string;
}

/** An invitation waiting for someone with no account to set one up. */
export interface Invitation {
  id: string;
  email: string;
  role: OrgRole;
  teams: { id: string; name: string }[];
  invited_by?: string;
  expires_at: string;
  expired: boolean;
  created_at: string;
}

/** Someone with an account is added straight away; someone with none is emailed an invitation. */
export type InviteResult = { status: "added"; member: OrgMember } | { status: "invited"; invitation: Invitation };

/** Every organisation the signed-in person is in, in the order sign-in picks them. */
export function listMyOrganisations(): Promise<OrganisationChoice[]> {
  return apiFetch<OrganisationChoice[]>(USERS_API, "/orblode/session/organisations");
}

export function getOrganisation(): Promise<Organisation> {
  return apiFetch<Organisation>(USERS_API, "/orblode/organisation");
}

export function updateMemberPrivileges(change: Partial<MemberPrivileges>): Promise<Organisation> {
  return apiFetch<Organisation>(USERS_API, "/orblode/organisation/settings", { method: "PATCH", body: change });
}

/** Active people, owners first, then admins, then members. */
export function listOrgMembers(): Promise<OrgMember[]> {
  return apiFetch<OrgMember[]>(USERS_API, "/orblode/organisation/members");
}

export function inviteMember(req: InviteRequest): Promise<InviteResult> {
  return apiFetch<InviteResult>(USERS_API, "/orblode/organisation/members", { method: "POST", body: req });
}

/** Pending invitations, expired ones included. */
export function listInvitations(): Promise<Invitation[]> {
  return apiFetch<Invitation[]>(USERS_API, "/orblode/organisation/invitations");
}

/** A new link that works for 7 days; the old one stops working. */
export function resendInvitation(id: string, inviteUrl?: string): Promise<Invitation> {
  return apiFetch<Invitation>(USERS_API, `/orblode/organisation/invitations/${encodeURIComponent(id)}/resend`, {
    method: "POST",
    body: inviteUrl ? { invite_url: inviteUrl } : {},
  });
}

export async function revokeInvitation(id: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/organisation/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Where an invitation's link lands on this site. */
export const invitePageUrl = () => new URL("/invite", window.location.origin).toString();

/** Only owners make or unmake owners, and the last owner stays (409). */
export function changeMemberRole(userId: string, role: OrgRole): Promise<OrgMember> {
  return apiFetch<OrgMember>(USERS_API, `/orblode/organisation/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: { role } });
}

/** Takes away every role the person holds in the organisation, then their membership. Anyone may remove themselves. */
export async function removeOrgMember(userId: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/organisation/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export interface Team {
  id: string;
  name: string;
  description: string;
  member_count: number;
  /** The signed-in person's role in the team, absent when they are not in it. */
  viewer_role?: TeamRole;
  can_manage: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  user_id: string;
  name?: string;
  email?: string;
  role: TeamRole;
}

/** A workspace or site the team holds roles on. */
export interface TeamAccess {
  type: "workspace" | "project";
  id: string;
  name: string;
  workspace_id?: string;
  roles: string[];
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  access: TeamAccess[];
}

export function listTeams(): Promise<Team[]> {
  return apiFetch<Team[]>(USERS_API, "/orblode/teams");
}

export function getTeam(id: string): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(USERS_API, `/orblode/teams/${encodeURIComponent(id)}`);
}

/** The caller becomes a maintainer. */
export function createTeam(req: { name: string; description?: string; member_ids?: string[] }): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(USERS_API, "/orblode/teams", { method: "POST", body: req });
}

export function updateTeam(id: string, change: { name?: string; description?: string }): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(USERS_API, `/orblode/teams/${encodeURIComponent(id)}`, { method: "PATCH", body: change });
}

/** Every role the team was given goes with it. */
export async function deleteTeam(id: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/teams/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setTeamMember(id: string, userId: string, role: TeamRole): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(USERS_API, `/orblode/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: { role },
  });
}

export async function removeTeamMember(id: string, userId: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export type SubjectType = "user" | "team" | "organisation";

/** One grantee's roles. Without a source the roles were given on the workspace or site itself; with one they
 * come from the site's workspace or from being an owner or admin of the organisation, and change there. */
export interface AccessEntry {
  subject: { type: SubjectType; id: string; name: string; email?: string };
  roles: string[];
  source?: { type: "workspace" | "organisation"; id: string; name: string };
  assigned_at?: string;
}

/** Where access is granted: a workspace (reaching every site in it) or one site. */
export type AccessScope = "workspace" | "project";

const accessPath = (scope: AccessScope, id: string) => `/orblode/${scope === "workspace" ? "workspaces" : "projects"}/${encodeURIComponent(id)}/access`;

export function getAccess(scope: AccessScope, id: string): Promise<AccessEntry[]> {
  return apiFetch<AccessEntry[]>(USERS_API, accessPath(scope, id));
}

/** Replaces the grantee's roles and answers the access as it now is. */
export function setAccess(scope: AccessScope, id: string, subject: { type: SubjectType; id: string }, roles: string[]): Promise<AccessEntry[]> {
  return apiFetch<AccessEntry[]>(USERS_API, accessPath(scope, id), {
    method: "PUT",
    body: { subject_type: subject.type, subject_id: subject.id, roles },
  });
}

export async function removeAccess(scope: AccessScope, id: string, subject: { type: SubjectType; id: string }): Promise<void> {
  await apiFetch<null>(USERS_API, `${accessPath(scope, id)}/${subject.type}/${encodeURIComponent(subject.id)}`, { method: "DELETE" });
}

/** Every permission the caller holds on the site, false when denied. */
/** What the caller may do across a workspace: on it, or on any of its sites. A user-svc that predates it sends none. */
export interface WorkspaceAccessSummary {
  can_manage: boolean;
  can_upload_any: boolean;
  can_run_analysis_any: boolean;
  can_plan_mission_any: boolean;
  can_upload_mission_data_any: boolean;
  can_vet_any: boolean;
}

export function getWorkspacePermissions(
  workspaceId: string
): Promise<{ workspace_id: string; permissions: Record<string, boolean>; summary?: WorkspaceAccessSummary }> {
  return apiFetch(USERS_API, `/orblode/auth/permissions?workspace_id=${encodeURIComponent(workspaceId)}`);
}

export function getProjectPermissions(projectId: string): Promise<{ project_id: string; permissions: Record<string, boolean> }> {
  return apiFetch(USERS_API, `/orblode/auth/permissions?project_id=${encodeURIComponent(projectId)}`);
}

/** A role an organisation made by choosing permissions; it is given on a workspace or a site like a built-in one. */
export interface CustomRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  template?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionInfo {
  key: string;
  label: string;
  description: string;
  locked?: boolean;
}

export interface RoleCatalogue {
  groups: { key: string; label: string; permissions: PermissionInfo[] }[];
  templates: { key: string; name: string; description: string; permissions: string[] }[];
}

export function listCustomRoles(): Promise<CustomRole[]> {
  return apiFetch<{ roles: CustomRole[] }>(USERS_API, "/orblode/roles").then((r) => r.roles ?? []);
}

export function getRoleCatalogue(): Promise<RoleCatalogue> {
  return apiFetch<RoleCatalogue>(USERS_API, "/orblode/roles/catalogue");
}

export function createCustomRole(role: Omit<CustomRole, "id">): Promise<CustomRole> {
  return apiFetch<CustomRole>(USERS_API, "/orblode/roles", { method: "POST", body: role });
}

export function updateCustomRole(id: string, role: Omit<CustomRole, "id">): Promise<CustomRole> {
  return apiFetch<CustomRole>(USERS_API, `/orblode/roles/${encodeURIComponent(id)}`, { method: "PATCH", body: role });
}

export async function deleteCustomRole(id: string): Promise<void> {
  await apiFetch<null>(USERS_API, `/orblode/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** One grantee's custom roles on a workspace or a site; inherited rows name their workspace in `source`. */
export interface CustomAccessEntry {
  subject: AccessEntry["subject"];
  role_ids: string[];
  source?: AccessEntry["source"];
}

const customAccessPath = (scope: AccessScope, id: string) =>
  `/orblode/${scope === "workspace" ? "workspaces" : "projects"}/${encodeURIComponent(id)}/custom-access`;

const entriesOf = (body: CustomAccessEntry[] | { entries?: CustomAccessEntry[] }) => (Array.isArray(body) ? body : (body.entries ?? []));

export function getCustomAccess(scope: AccessScope, id: string): Promise<CustomAccessEntry[]> {
  return apiFetch<CustomAccessEntry[] | { entries?: CustomAccessEntry[] }>(USERS_API, customAccessPath(scope, id)).then(entriesOf);
}

/** Replaces the grantee's custom roles on the workspace or site; an empty list takes them all away. */
export function setCustomAccess(scope: AccessScope, id: string, subject: { type: SubjectType; id: string }, roleIds: string[]): Promise<CustomAccessEntry[]> {
  return apiFetch<CustomAccessEntry[] | { entries?: CustomAccessEntry[] }>(USERS_API, customAccessPath(scope, id), {
    method: "PUT",
    body: { subject_type: subject.type, subject_id: subject.id, role_ids: roleIds },
  }).then(entriesOf);
}
