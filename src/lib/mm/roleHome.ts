import type { WorkspaceAccessSummary } from "../api/userSvc.ts";

/** How a person works in a minor-minerals workspace: planners see Orblode's own rail, an official only the reports
 * they vet, a vendor only the missions issued to their company. */
export type MMMode = "planner" | "official" | "vendor";

/** A person who can plan, upload, run studies or manage anything in the workspace is a planner. Otherwise uploading
 * mission data makes them a vendor, and vetting an official. A user-svc without the summary leaves everyone a planner. */
export function modeOf(
  summary: WorkspaceAccessSummary | null | undefined,
): MMMode {
  if (!summary) return "planner";
  if (
    summary.can_manage ||
    summary.can_upload_any ||
    summary.can_run_analysis_any ||
    summary.can_plan_mission_any
  )
    return "planner";
  if (summary.can_upload_mission_data_any) return "vendor";
  if (summary.can_vet_any) return "official";
  return "planner";
}

export const MODE_HOME: Record<MMMode, string> = {
  planner: "/globe",
  official: "/reports",
  vendor: "/mm/missions",
};
