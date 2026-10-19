import { useOrganisation } from "@/lib/organisation/store";
import { useCurrentWorkspace } from "@/lib/workspaces/store";

export const MINOR_MINERALS = "minor_minerals";

/** Whether the organisation is licensed for minor minerals, so it may have minor-minerals workspaces; false until it loads. */
export function useMinorMineralsLicence(): boolean {
  return useOrganisation((s) => s.organisation?.extensions?.includes(MINOR_MINERALS) ?? false);
}

/** Whether the open workspace is a minor-minerals one in a licensed organisation. */
export function useMinorMinerals(): boolean {
  const licensed = useMinorMineralsLicence();
  const type = useCurrentWorkspace()?.type;
  return licensed && type === MINOR_MINERALS;
}
