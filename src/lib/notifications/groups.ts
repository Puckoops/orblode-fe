import type { NotificationTypePreference } from "../api/notifications.ts";

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Processing", types: ["survey_processed", "survey_failed", "uploads_unfinished"] },
  { label: "Designs", types: ["design_ready", "design_failed"] },
  { label: "Measurements", types: ["measurement_computed", "measurement_failed", "stockpiles_computed"] },
  { label: "Sites", types: ["reconciliation_red", "stock_anomaly", "site_summary"] },
  { label: "People", types: ["member_joined"] },
];

export interface NotificationGroup {
  label: string;
  types: NotificationTypePreference[];
}

/** The settings' sections, in their order; a type orblode-svc adds before this list knows it lands in Other. */
export function groupTypes(types: NotificationTypePreference[]): NotificationGroup[] {
  const known = new Set(GROUPS.flatMap((g) => g.types));
  const groups = GROUPS.map((g) => ({ label: g.label, types: g.types.flatMap((t) => types.filter((x) => x.type === t)) }));
  groups.push({ label: "Other", types: types.filter((t) => !known.has(t.type)) });
  return groups.filter((g) => g.types.length > 0);
}
