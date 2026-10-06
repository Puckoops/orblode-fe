export interface AuthUser {
  id: string;
  email: string;
  name: string;
  client_id: string;
}

export interface AuthClient {
  id: string;
  name: string;
  company_name?: string;
  email?: string;
  domain?: string;
}

export interface AuthMembership {
  role: string;
  class: number;
  is_superuser: boolean;
}

export interface Profile {
  user: AuthUser;
  client: AuthClient;
  membership: AuthMembership | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The profile cookie's JSON, or null when it is missing or not shaped like one. */
export function parseProfile(raw: string | undefined | null): Profile | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { user, client, membership } = value as Record<string, unknown>;
  if (!user || typeof user !== "object" || !client || typeof client !== "object") return null;
  const u = user as Record<string, unknown>;
  const c = client as Record<string, unknown>;
  if (!str(u.id) || !str(c.id)) return null;
  const m = membership && typeof membership === "object" ? (membership as Record<string, unknown>) : null;
  return {
    user: { id: str(u.id), email: str(u.email), name: str(u.name), client_id: str(u.client_id) || str(c.id) },
    client: {
      id: str(c.id),
      name: str(c.name),
      company_name: str(c.company_name) || undefined,
      email: str(c.email) || undefined,
      domain: str(c.domain) || undefined,
    },
    membership: m
      ? { role: str(m.role), class: typeof m.class === "number" ? m.class : 0, is_superuser: m.is_superuser === true }
      : null,
  };
}

/** 1–2 letter avatar initials from a user's name, falling back to the email. */
export function userInitials(user: Pick<AuthUser, "name" | "email"> | null): string {
  const name = user?.name?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  const email = user?.email?.trim();
  return email ? email[0].toUpperCase() : "";
}
