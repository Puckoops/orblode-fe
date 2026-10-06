"use client";

import { Building03Icon } from "@hugeicons/core-free-icons";
import { AppShell, Breadcrumbs, Icon, Topbar } from "@puckoops/camelot";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { AppRail } from "./AppRail";
import { TITLES } from "./nav";
import { useRailExpanded } from "./railState";
import styles from "./shell.module.css";

function Crumbs() {
  const pathname = usePathname();
  const base = Object.keys(TITLES).find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const items = [{ label: "ORBLODE", href: "/globe" }];
  if (base) items.push({ label: TITLES[base], href: base });
  return <Breadcrumbs items={items} linkAs={Link} />;
}

/** The signed-in client, as the login response named it; informative only. */
function ClientName() {
  const client = useAuthClient();
  const name = client?.company_name?.trim() || client?.name?.trim();
  if (!name) return null;
  return (
    <span className={`small ${styles.client}`} title={name}>
      <Icon icon={Building03Icon} size={16} />
      <span className={styles.clientName}>{name}</span>
    </span>
  );
}

/**
 * The app frame for signed-in pages. Dashboard pages get the topbar; the viewer owns the whole
 * viewport beside the rail.
 */
export function AppFrame({ children, variant = "dashboard" }: { children: ReactNode; variant?: "dashboard" | "viewer" }) {
  const [expanded, toggle] = useRailExpanded();
  const classes = [expanded ? "" : styles.collapsed, variant === "viewer" ? styles.fullHeight : ""].filter(Boolean).join(" ");
  return (
    <AppShell className={classes} sidebar={<AppRail expanded={expanded} onToggle={toggle} />}>
      {variant === "dashboard" && <Topbar start={<Crumbs />} end={<ClientName />} />}
      {children}
    </AppShell>
  );
}
