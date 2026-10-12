"use client";

import { Logout03Icon, MoreHorizontalIcon, Settings02Icon } from "@hugeicons/core-free-icons";
import { IconButton, Menu, MenuGroup, MenuItem, MenuLabel, MenuSeparator, SegmentedControl, useTheme, type ThemePreference } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { releasePush } from "@/lib/push/client";

export const APPEARANCE: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function UserMenu() {
  const router = useRouter();
  const { preference, setPreference } = useTheme();

  const leave = async () => {
    await releasePush().catch(() => undefined);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Menu trigger={<IconButton icon={MoreHorizontalIcon} aria-label="Account" variant="bare" size="sm" />} side="top" align="start" minWidth={232}>
      <MenuItem icon={Settings02Icon} onSelect={() => router.push("/settings")}>
        Settings
      </MenuItem>
      <MenuLabel>Appearance</MenuLabel>
      <MenuGroup>
        <SegmentedControl<ThemePreference> aria-label="Appearance" size="sm" value={preference} onValueChange={setPreference} options={APPEARANCE} />
      </MenuGroup>
      <MenuSeparator />
      <MenuItem icon={Logout03Icon} onSelect={leave}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
