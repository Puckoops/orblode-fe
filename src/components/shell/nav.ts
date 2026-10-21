import {
  Add01Icon,
  ChartLineData01Icon,
  DashboardSquare01Icon,
  DroneIcon,
  Files01Icon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import type { IconDefinition } from "@puckoops/camelot";

export interface NavItem {
  href: string;
  label: string;
  icon: IconDefinition;
  isActive: (pathname: string) => boolean;
}

export const NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: DashboardSquare01Icon, isActive: (p) => p === "/overview" },
  { href: "/projects", label: "Projects", icon: Globe02Icon, isActive: (p) => p === "/projects" || p.startsWith("/viewer/") },
  { href: "/upload", label: "Create", icon: Add01Icon, isActive: (p) => p === "/upload" },
  { href: "/files", label: "Files", icon: Files01Icon, isActive: (p) => p === "/files" },
  { href: "/reports", label: "Reports", icon: ChartLineData01Icon, isActive: (p) => p === "/reports" },
];

/** An official in a minor-minerals workspace sees only the reports they vet. */
export const OFFICIAL_NAV: NavItem[] = [
  { href: "/reports", label: "Reports", icon: ChartLineData01Icon, isActive: (p) => p === "/reports" || p.startsWith("/mm/reports/") },
];

/** A drone vendor sees the missions issued to their company and their files. */
export const VENDOR_NAV: NavItem[] = [
  { href: "/mm/missions", label: "Missions", icon: DroneIcon, isActive: (p) => p.startsWith("/mm/missions") },
  { href: "/files", label: "Files", icon: Files01Icon, isActive: (p) => p === "/files" },
];

export const TITLES: Record<string, string> = {
  "/overview": "Overview",
  "/projects": "Projects",
  "/upload": "Create",
  "/files": "Files",
  "/reports": "Reports",
  "/settings": "Settings",
  "/mm/missions": "Missions",
  "/mm/dgps": "DGPS",
};

/** Minor-minerals records live under the Orblode page their kind folded into. */
export const FOLDED: Record<string, string> = {
  "/mm/leases": "/projects",
  "/mm/register": "/projects",
  "/mm/reports": "/reports",
  "/mm/registers": "/settings",
};
