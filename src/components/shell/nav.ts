import {
  Add01Icon,
  ChartLineData01Icon,
  Database01Icon,
  DroneIcon,
  Files01Icon,
  Globe02Icon,
  Home01Icon,
  GpsSignal01Icon,
  Note01Icon,
  TaskDaily01Icon,
} from "@hugeicons/core-free-icons";
import type { IconDefinition } from "@puckoops/camelot";

export interface NavItem {
  href: string;
  label: string;
  icon: IconDefinition;
  isActive: (pathname: string) => boolean;
}

export const NAV: NavItem[] = [
  { href: "/globe", label: "Sites", icon: Globe02Icon, isActive: (p) => p === "/globe" || p.startsWith("/viewer/") },
  { href: "/upload", label: "Create", icon: Add01Icon, isActive: (p) => p === "/upload" },
  { href: "/files", label: "Files", icon: Files01Icon, isActive: (p) => p === "/files" },
  { href: "/reports", label: "Reports", icon: ChartLineData01Icon, isActive: (p) => p === "/reports" },
];

/** A minor-minerals workspace's own pages, leading its rail. */
export const MM_NAV: NavItem[] = [
  { href: "/mm", label: "Overview", icon: Home01Icon, isActive: (p) => p === "/mm" },
  { href: "/mm/leases", label: "Leases", icon: TaskDaily01Icon, isActive: (p) => p.startsWith("/mm/leases") || p === "/mm/register" },
  { href: "/mm/missions", label: "Missions", icon: DroneIcon, isActive: (p) => p.startsWith("/mm/missions") },
  { href: "/mm/dgps", label: "DGPS", icon: GpsSignal01Icon, isActive: (p) => p.startsWith("/mm/dgps") },
  { href: "/mm/reports", label: "Studies", icon: Note01Icon, isActive: (p) => p.startsWith("/mm/reports") },
  { href: "/mm/registers", label: "Registers", icon: Database01Icon, isActive: (p) => p.startsWith("/mm/registers") },
];

export const TITLES: Record<string, string> = {
  "/globe": "Sites",
  "/upload": "Create",
  "/files": "Files",
  "/reports": "Reports",
  "/settings": "Settings",
  "/mm": "Minor minerals",
  "/mm/leases": "Leases",
  "/mm/register": "Project register",
  "/mm/missions": "Missions",
  "/mm/dgps": "DGPS",
  "/mm/reports": "Studies",
  "/mm/registers": "Registers",
};
