import { ChartLineData01Icon, Download01Icon, Globe02Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import type { IconDefinition } from "@puckoops/camelot";

export interface NavItem {
  href: string;
  label: string;
  icon: IconDefinition;
  isActive: (pathname: string) => boolean;
}

export const NAV: NavItem[] = [
  { href: "/globe", label: "Sites", icon: Globe02Icon, isActive: (p) => p === "/globe" || p.startsWith("/viewer/") },
  { href: "/upload", label: "Upload", icon: Upload01Icon, isActive: (p) => p === "/upload" },
  { href: "/files", label: "Outputs", icon: Download01Icon, isActive: (p) => p === "/files" },
  { href: "/reports", label: "Reports", icon: ChartLineData01Icon, isActive: (p) => p === "/reports" },
];

export const TITLES: Record<string, string> = {
  "/globe": "Sites",
  "/upload": "Upload",
  "/files": "Outputs",
  "/reports": "Reports",
  "/settings": "Settings",
};
