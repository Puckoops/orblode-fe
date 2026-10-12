const ORGANISATION_FIELDS = ["name", "domain", "phone", "address", "city", "state", "zip", "country", "company_name", "company_role"] as const;

/** The sign-up form's organisation and owner fields, trimmed, for user-svc's POST /orblode/clients/signup. */
export function organisationFields(body: Record<string, unknown> | null) {
  const fields: Record<string, string> = {};
  for (const key of ORGANISATION_FIELDS) fields[key] = typeof body?.[key] === "string" ? (body[key] as string).trim() : "";
  return fields;
}
