import { create } from "zustand";
import { getProjectPermissions } from "@/lib/api/userSvc";

interface SitePermissionsState {
  /** By site, then permission; a site is absent until its permissions load. */
  bySite: Record<string, Record<string, boolean>>;
  load: (siteId: string) => Promise<void>;
}

export const useSitePermissions = create<SitePermissionsState>((set, get) => ({
  bySite: {},
  load: async (siteId) => {
    try {
      const { permissions } = await getProjectPermissions(siteId);
      set({ bySite: { ...get().bySite, [siteId]: permissions } });
    } catch {
      // Unknown permissions leave every control as it was; the services still refuse what isn't allowed.
    }
  },
}));

/** False only once the person is known to lack the permission on the site. */
export function useMay(siteId: string | null | undefined, permission: string): boolean {
  return useSitePermissions((s) => !siteId || s.bySite[siteId]?.[permission] !== false);
}
