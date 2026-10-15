import type { SurveyShare } from "../api/orblodeSvc.ts";
import type { OrgMember, SubjectType, Team } from "../api/userSvc.ts";
import { subjectKey, type SubjectOption } from "./roles.ts";

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
        name: p?.name || p?.email || "Someone no longer in the organisation",
        meta: p?.name ? p.email : undefined,
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
      label: p.name || p.email || "Unknown account",
      meta: p.name ? p.email : undefined,
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
