import { create } from "zustand";
import { listSiteAlerts, type SiteAlert } from "@/lib/api/orblodeSvc";

interface SiteAlertsState {
  /** Every site of the signed-in client whose newest surveys reconcile red. */
  sites: SiteAlert[];
  refresh: () => Promise<void>;
}

export const useSiteAlerts = create<SiteAlertsState>((set) => ({
  sites: [],
  refresh: async () => {
    try {
      set({ sites: await listSiteAlerts() });
    } catch {
      // Keep what was shown; the next reconciliation notice or reload tries again.
    }
  },
}));
