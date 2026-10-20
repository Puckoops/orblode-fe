"use client";

import { AppShell, Breadcrumbs, Topbar } from "@puckoops/camelot";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { NotificationsLive } from "@/components/notifications/NotificationsLive";
import { OrganisationLinks } from "@/components/organisation/OrganisationLinks";
import { WorkspaceSync } from "@/components/workspaces/WorkspaceSync";
import { AppRail } from "./AppRail";
import { FOLDED, TITLES } from "./nav";
import { useRailExpanded } from "./railState";
import styles from "./shell.module.css";

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

function Crumbs() {
  const raw = usePathname();
  const folded = Object.keys(FOLDED).find((p) => under(raw, p));
  const pathname = folded ? FOLDED[folded] : raw;
  const base = Object.keys(TITLES).find((p) => under(pathname, p));
  const items = [{ label: "ORBLODE", href: "/globe" }];
  if (base) items.push({ label: TITLES[base], href: base });
  return <Breadcrumbs items={items} linkAs={Link} />;
}

/**
 * The app frame for signed-in pages. Dashboard pages get the topbar, with the notifications bell at
 * its end; the viewer owns the whole viewport beside the rail and floats the bell over its canvas.
 */
export function AppFrame({ children, variant = "dashboard" }: { children: ReactNode; variant?: "dashboard" | "viewer" }) {
  const [expanded, toggle] = useRailExpanded();
  const classes = [expanded ? "" : styles.collapsed, variant === "viewer" ? styles.fullHeight : ""].filter(Boolean).join(" ");
  return (
    <AppShell className={classes} sidebar={<AppRail expanded={expanded} onToggle={toggle} />}>
      {variant === "dashboard" && (
        <Topbar
          start={<Crumbs />}
          end={
            <div className={styles.topEnd}>
              <NotificationsBell />
            </div>
          }
        />
      )}
      <NotificationsLive />
      <WorkspaceSync />
      <OrganisationLinks />
      {children}
    </AppShell>
  );
}
