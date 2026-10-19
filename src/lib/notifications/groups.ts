import type { NotificationTypePreference } from "../api/notifications.ts";

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Processing", types: ["survey_processed", "survey_failed", "uploads_unfinished"] },
  { label: "Designs", types: ["design_ready", "design_failed"] },
  { label: "Measurements", types: ["measurement_computed", "measurement_failed", "stockpiles_computed"] },
  { label: "Sites", types: ["reconciliation_red", "stock_anomaly", "site_summary"] },
  { label: "People", types: ["member_joined", "added_to_organisation", "survey_shared"] },
  {
    label: "Minor minerals",
    types: [
      "mm_application_filed",
      "mm_study_ready",
      "mm_study_failed",
      "mm_report_submitted",
      "mm_report_returned",
      "mm_report_vetted",
      "mm_mission_issued",
      "mm_mission_returned",
      "mm_move_approval",
      "mm_flight_uploaded",
      "mm_gnss_processed",
      "mm_gnss_failed",
    ],
  },
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
