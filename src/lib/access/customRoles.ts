import { create } from "zustand";
import { getRoleCatalogue, listCustomRoles, type CustomRole, type RoleCatalogue } from "@/lib/api/userSvc";

// The organisation's custom roles and the permissions they are built from, loaded once and shared by the Roles
// tab and the access dialogs.

interface CustomRolesState {
  roles: CustomRole[] | null;
  catalogue: RoleCatalogue | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useCustomRoles = create<CustomRolesState>((set, get) => ({
  roles: null,
  catalogue: null,
  load: () => {
    if (get().roles && get().catalogue) return Promise.resolve();
    loading ??= get()
      .refresh()
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  refresh: async () => {
    try {
      const [roles, catalogue] = await Promise.all([listCustomRoles(), getRoleCatalogue()]);
      set({ roles, catalogue });
    } catch (err) {
      console.error("Failed to fetch custom roles:", err);
      set({ roles: get().roles ?? [], catalogue: get().catalogue ?? { groups: [], templates: [] } });
    }
  },
}));

/** Custom role names, in the order given, for a row of the access list. */
export function describeCustomRoles(ids: string[], roles: CustomRole[] | null): string {
  if (!roles) return "";
  return ids.map((id) => roles.find((r) => r.id === id)?.name ?? "A removed role").join(", ");
}

/** What a custom role allows, in the catalogue's words. */
export function permissionLabels(role: Pick<CustomRole, "permissions">, catalogue: RoleCatalogue | null): string[] {
  if (!catalogue) return role.permissions;
  const labels = new Map(catalogue.groups.flatMap((g) => g.permissions.map((p) => [p.key, p.label] as const)));
  return role.permissions.map((p) => labels.get(p) ?? p.replace(/^can_/, "").replace(/_/g, " "));
}
