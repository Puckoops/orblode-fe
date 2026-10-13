import { create } from "zustand";
import { getOrganisation, listMyOrganisations, type Organisation } from "@/lib/api/userSvc";
import type { OrganisationChoice } from "@/lib/organisation/links";

interface OrganisationState {
  clientId: string;
  /** The signed-in client with what the person may do in it; null until loaded or when it could not be. */
  organisation: Organisation | null;
  load: (clientId: string) => Promise<void>;
  /** Reads it again, after a change to the person's role or the member privileges. */
  refresh: () => Promise<void>;
  /** Every organisation the person is in, for the switcher; null until loaded or when it could not be. */
  mine: OrganisationChoice[] | null;
  loadMine: () => Promise<OrganisationChoice[] | null>;
  /** Goes up when the organisation's people may have changed, such as when someone joins. */
  membersVersion: number;
  bumpMembers: () => void;
}

let loadingMine: Promise<OrganisationChoice[] | null> | null = null;

// Both layouts mount the loader; the second asks while the first is still reading.
let loading: { clientId: string; done: Promise<void> } | null = null;

export const useOrganisation = create<OrganisationState>((set, get) => ({
  clientId: "",
  organisation: null,
  load: (clientId) => {
    if (loading?.clientId === clientId) return loading.done;
    if (get().clientId === clientId && get().organisation) return Promise.resolve();
    set({ clientId, organisation: null });
    const done = get()
      .refresh()
      .finally(() => {
        if (loading?.done === done) loading = null;
      });
    loading = { clientId, done };
    return done;
  },
  refresh: async () => {
    const clientId = get().clientId;
    try {
      const organisation = await getOrganisation();
      if (get().clientId === clientId) set({ organisation });
    } catch (err) {
      console.error("Failed to fetch the organisation:", err);
    }
  },
  mine: null,
  loadMine: () => {
    loadingMine ??= listMyOrganisations()
      .then((mine) => {
        set({ mine });
        return mine;
      })
      .catch((err) => {
        console.error("Failed to fetch your organisations:", err);
        return null;
      })
      .finally(() => {
        loadingMine = null;
      });
    return loadingMine;
  },
  membersVersion: 0,
  bumpMembers: () => set((s) => ({ membersVersion: s.membersVersion + 1 })),
}));

/** What the signed-in person may do in the organisation; null while it loads. */
export const useOrgViewer = () => useOrganisation((s) => s.organisation?.viewer ?? null);
