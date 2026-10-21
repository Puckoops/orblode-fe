import type { SurveyShare } from "../api/orblodeSvc.ts";
import type { AccessEntry, OrgMember, SubjectType, Team } from "../api/userSvc.ts";
import { describeRoles, subjectKey, type SubjectOption } from "./roles.ts";

export interface ShareRow {
  key: string;
  type: SubjectType;
  id: string;
  name: string;
  meta?: string;
}

const teamMeta = (t: Team) => `Team · ${t.member_count} ${t.member_count === 1 ? "person" : "people"}`;

/** Whether everyone in the organisation may view the survey. */
export const sharedWithEveryone = (entries: SurveyShare[]) => entries.some((e) => e.subject.type === "organisation");

/** The teams, then the people, the survey is shared with, named from the organisation; the organisation itself is its general access, not a row. */
export function shareRows(entries: SurveyShare[], people: OrgMember[], teams: Team[]): ShareRow[] {
  const person = new Map(people.map((p) => [p.user_id, p]));
  const team = new Map(teams.map((t) => [t.id, t]));
  const rows: ShareRow[] = [];
  for (const { subject } of entries) {
    if (subject.type === "team") {
      const t = team.get(subject.id);
      rows.push({ key: subjectKey("team", subject.id), type: "team", id: subject.id, name: t?.name ?? "A team that was deleted", meta: t ? teamMeta(t) : undefined });
    } else if (subject.type === "user") {
      const p = person.get(subject.id);
      rows.push({
        key: subjectKey("user", subject.id),
        type: "user",
        id: subject.id,
        name: p?.name?.trim() || p?.email || "Someone no longer in the organisation",
        meta: p?.name?.trim() ? p.email : undefined,
      });
    }
  }
  const order = (r: ShareRow) => (r.type === "team" ? 0 : 1);
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

/** The teams and people the survey isn't shared with yet. */
export function shareOptions(entries: SurveyShare[], people: OrgMember[], teams: Team[]): SubjectOption[] {
  const taken = new Set(entries.map((e) => subjectKey(e.subject.type, e.subject.id)));
  const options: SubjectOption[] = [
    ...teams.map((t) => ({ value: subjectKey("team", t.id), label: t.name, meta: teamMeta(t) })),
    ...people.map((p) => ({
      value: subjectKey("user", p.user_id),
      label: p.name?.trim() || p.email || "Unknown account",
      meta: p.name?.trim() ? p.email : undefined,
      keywords: p.email ? [p.email] : undefined,
    })),
  ];
  return options.filter((o) => !taken.has(o.value));
}

/** The survey's viewer; `org` opens it in the right organisation for someone in several. */
export function shareLink(origin: string, surveyId: string, orgId: string | null | undefined): string {
  const url = new URL(`/viewer/${encodeURIComponent(surveyId)}`, origin);
  if (orgId) url.searchParams.set("org", orgId);
  return url.toString();
}

/**
 * What an invite box holds, read as Notion reads it: names, emails or team names separated by commas. Each match is
 * a person by email or name, or a team by name, ignoring case; `already` are matches in `taken`, and anything matching
 * no one is unknown.
 */
export function resolveInvitees(
  text: string,
  options: SubjectOption[],
  taken: ReadonlySet<string> = new Set()
): { found: SubjectOption[]; already: SubjectOption[]; unknown: string[] } {
  const found: SubjectOption[] = [];
  const already: SubjectOption[] = [];
  const unknown: string[] = [];
  for (const token of text.split(",").map((t) => t.trim()).filter(Boolean)) {
    const key = token.toLowerCase();
    const match = options.find((o) => o.label.toLowerCase() === key || o.keywords?.some((k) => k.toLowerCase() === key));
    const into = !match ? null : taken.has(match.value) ? already : found;
    if (!match) unknown.push(token);
    else if (!into!.includes(match)) into!.push(match);
  }
  return { found, already, unknown };
}

/**
 * Options for what is typed after the last comma, at most `limit`: names or emails with a word starting with it
 * first, then, from two characters on, those holding it anywhere.
 */
export function inviteSuggestions(text: string, options: SubjectOption[], picked: string[], limit = 6): SubjectOption[] {
  const query = (text.split(",").pop() ?? "").trim().toLowerCase();
  if (!query) return [];
  const free = options.filter((o) => !picked.includes(o.value));
  const fields = (o: SubjectOption) => [o.label, ...(o.keywords ?? [])].map((v) => v.toLowerCase());
  const starts = (o: SubjectOption) => fields(o).some((v) => v.split(/\s+/).some((word) => word.startsWith(query)));
  const holds = (o: SubjectOption) => query.length > 1 && fields(o).some((v) => v.includes(query));
  return [...free.filter(starts), ...free.filter((o) => !starts(o) && holds(o))].slice(0, limit);
}

/** The signed-in person's own access to the survey, in Notion's words, from their site permissions. */
export function ownAccess(permissions: Record<string, boolean> | undefined): "Full access" | "Can edit" | "Can view" {
  if (permissions?.can_manage_users) return "Full access";
  if (permissions?.can_create_measurement) return "Can edit";
  return "Can view";
}

/** Who reaches the survey through its site's roles: whether everyone in the organisation, how many people and teams,
 * and their one role or "Mixed access". */
export function siteAccessSummary(entries: AccessEntry[]): { everyone: boolean; people: number; teams: number; access: string } {
  const labels = new Set(entries.map((e) => describeRoles(e.roles, "project") || "Owner or admin"));
  return {
    everyone: entries.some((e) => e.subject.type === "organisation"),
    people: new Set(entries.filter((e) => e.subject.type === "user").map((e) => e.subject.id)).size,
    teams: new Set(entries.filter((e) => e.subject.type === "team").map((e) => e.subject.id)).size,
    access: labels.size === 1 ? [...labels][0] : "Mixed access",
  };
}

/** "Project · everyone at Acme · 3 people · 1 team". */
export function siteAccessDetail(summary: { everyone: boolean; people: number; teams: number }, orgName: string): string {
  const parts = ["Project"];
  if (summary.everyone) parts.push(`everyone at ${orgName}`);
  if (summary.people > 0) parts.push(`${summary.people} ${summary.people === 1 ? "person" : "people"}`);
  if (summary.teams > 0) parts.push(`${summary.teams} ${summary.teams === 1 ? "team" : "teams"}`);
  return parts.join(" · ");
}
