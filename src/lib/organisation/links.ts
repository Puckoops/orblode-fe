/** One of the signed-in person's organisations. `joined` is false until they first open it. */
export interface OrganisationChoice {
  id: string;
  name: string;
  company_name?: string;
  current: boolean;
  joined: boolean;
}

export const organisationLabel = (o: Pick<OrganisationChoice, "name" | "company_name">) => o.company_name?.trim() || o.name.trim();

/** The organisation a workspace's client id names: one of the person's organisations, else the open client. */
export function organisationForClient(
  clientId: string,
  organisations: readonly Pick<OrganisationChoice, "id" | "name" | "company_name">[] | null | undefined,
  current: Pick<OrganisationChoice, "id" | "name" | "company_name"> | null,
): string {
  const match = organisations?.find((o) => o.id === clientId);
  if (match) return organisationLabel(match);
  if (current && current.id === clientId) return organisationLabel(current);
  return "";
}

export type OrgLink = { kind: "none" } | { kind: "here" } | { kind: "switch"; id: string } | { kind: "unknown" };

/** What a link's `?org=` asks for: nothing, the organisation already open, another of theirs, or one they're not in. */
export function orgLink(param: string | null, organisations: OrganisationChoice[]): OrgLink {
  if (!param) return { kind: "none" };
  const found = organisations.find((o) => o.id === param);
  if (!found) return { kind: "unknown" };
  return found.current ? { kind: "here" } : { kind: "switch", id: found.id };
}

/** The same-site path of href with its `org` parameter dropped. */
export function withoutOrg(href: string): string {
  const url = new URL(href, "http://localhost");
  url.searchParams.delete("org");
  return url.pathname + url.search + url.hash;
}

/** Organisations they were added to and haven't opened, leaving out those already pointed out. */
export function unopened(organisations: OrganisationChoice[], pointedOut: readonly string[]): OrganisationChoice[] {
  return organisations.filter((o) => !o.current && !o.joined && !pointedOut.includes(o.id));
}
