import type { AccessEntry, AccessScope, OrgMember, OrgRole, OrgViewer, SubjectType, Team } from "@/lib/api/userSvc";

// What each role lets someone do, in the words the settings screens use. The rights come from the
// authorization model in user-svc (fga/orblode/authorization-model.fga); keep the two in step.

export interface RoleInfo {
  label: string;
  description: string;
}

export const ROLES: Record<string, RoleInfo> = {
  admin: { label: "Admin", description: "Manages the workspace and who has access to it, and is project manager on every site in it." },
  project_manager: { label: "Project manager", description: "Everything on the site: uploads, measurements, analysis, approvals, exports and who has access." },
  survey_manager: { label: "Survey manager", description: "Uploads surveys and designs, measures, and sees drafts." },
  gis_analyst: { label: "GIS analyst", description: "Measures, runs analysis, exports, and sees drafts." },
  mining_engineer: { label: "Mining engineer", description: "Measures, runs analysis, exports, and sees drafts." },
  reviewer: { label: "Reviewer", description: "Sees drafts and approves surveys." },
  client_admin: { label: "Client admin", description: "Sees and exports published results, and gives others client roles." },
  client_viewer: { label: "Viewer", description: "Sees published results." },
  api_user: { label: "API user", description: "Reads published results through the API." },
};

export const WORKSPACE_ROLES = ["admin", "survey_manager", "gis_analyst", "mining_engineer", "reviewer", "client_admin", "client_viewer", "api_user"];
export const PROJECT_ROLES = ["project_manager", "survey_manager", "gis_analyst", "mining_engineer", "reviewer", "client_admin", "client_viewer", "api_user"];
/** What a client admin who is not a project manager may give on a site. */
export const CLIENT_ROLES = ["client_admin", "client_viewer"];

export const rolesFor = (scope: AccessScope) => (scope === "workspace" ? WORKSPACE_ROLES : PROJECT_ROLES);

export function roleLabel(role: string): string {
  return ROLES[role]?.label ?? role.replace(/_/g, " ");
}

/** Roles in the order the scope lists them, labelled: "Survey manager, Reviewer". */
export function describeRoles(roles: string[], scope: AccessScope): string {
  const order = rolesFor(scope);
  return [...roles].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(roleLabel).join(", ");
}

export const ORG_ROLES: { value: OrgRole; label: string; description: string }[] = [
  { value: "owner", label: "Owner", description: "Everything an admin does, and adds or removes owners." },
  { value: "admin", label: "Admin", description: "Manages people, teams and access, and administers every workspace." },
  { value: "member", label: "Member", description: "Works where they're given access, and sees the default workspace." },
];

export const orgRoleLabel = (role: OrgRole) => ORG_ROLES.find((r) => r.value === role)?.label ?? role;

/** The roles the viewer may move someone holding `current` to; empty when they may not change it at all. */
export function orgRoleChoices(viewer: OrgViewer | null, current: OrgRole): OrgRole[] {
  if (!viewer?.can_manage_people) return [];
  if (viewer.can_manage_owners) return ORG_ROLES.map((r) => r.value);
  if (current === "owner") return [];
  return ORG_ROLES.map((r) => r.value).filter((r) => r !== "owner");
}

/** Whether the viewer may take this person out of the organisation; anyone may leave, except the last owner. */
export function canRemove(viewer: OrgViewer | null, member: OrgMember, owners: number): boolean {
  if (!viewer) return false;
  if (member.role === "owner" && owners < 2) return false;
  if (member.user_id === viewer.user_id) return true;
  return viewer.can_manage_people && (member.role !== "owner" || viewer.can_manage_owners);
}

/** Grants made on the object itself, and those reaching it from its workspace or the organisation. */
export function splitAccess(entries: AccessEntry[]): { direct: AccessEntry[]; inherited: AccessEntry[] } {
  return { direct: entries.filter((e) => !e.source), inherited: entries.filter((e) => e.source) };
}

export interface SubjectOption {
  value: string;
  label: string;
  meta?: string;
  keywords?: string[];
}

export const subjectKey = (type: SubjectType, id: string) => `${type}:${id}`;

export function parseSubjectKey(key: string): { type: SubjectType; id: string } {
  const at = key.indexOf(":");
  return { type: key.slice(0, at) as SubjectType, id: key.slice(at + 1) };
}

/** Who can be granted access and has no grant here yet: everyone in the organisation (a workspace only), then
 * teams, then people. */
export function grantableSubjects(
  scope: AccessScope,
  organisation: { id: string; name: string },
  teams: Team[],
  people: OrgMember[],
  granted: AccessEntry[],
): SubjectOption[] {
  const taken = new Set(granted.filter((e) => !e.source).map((e) => subjectKey(e.subject.type, e.subject.id)));
  const options: SubjectOption[] = [];
  if (scope === "workspace") {
    options.push({ value: subjectKey("organisation", organisation.id), label: `Everyone in ${organisation.name}`, meta: "Viewer only" });
  }
  for (const t of teams) {
    options.push({ value: subjectKey("team", t.id), label: t.name, meta: `Team · ${t.member_count}` });
  }
  for (const p of people) {
    options.push({ value: subjectKey("user", p.user_id), label: p.name || p.email || "Unknown account", meta: p.name ? p.email : undefined, keywords: p.email ? [p.email] : undefined });
  }
  return options.filter((o) => !taken.has(o.value));
}
