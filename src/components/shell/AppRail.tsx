"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "@hugeicons/core-free-icons";
import { Avatar, IconButton, Sidebar, SidebarFooter, SidebarItem, SidebarSection, SidebarUser, Tooltip } from "@puckoops/camelot";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { WorkspaceMenu } from "@/components/workspaces/WorkspaceMenu";
import { useAuthUser } from "@/hooks/useAuth";
import { useProcessing } from "@/lib/processing/store";
import { useSiteAlerts } from "@/lib/reports/alerts";
import { inSites } from "@/lib/workspaces/pick";
import { useWorkspaces } from "@/lib/workspaces/store";
import styles from "./shell.module.css";
import { NAV, type NavItem } from "./nav";
import { railDotClass } from "./railDot";
import { UserMenu } from "./UserMenu";

/** The global app rail: the workspace dropdown, then Sites, Create, Files and Reports, then the signed-in
 * person. Collapsed it shows icons only. Its counts are the current workspace's. */
export function AppRail({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const name = user?.name?.trim() || user?.email || "Account";
  const workspaceSites = useWorkspaces((s) => s.sites);
  const failed = useProcessing((s) => s.failed);
  const alerts = useSiteAlerts((s) => s.sites);
  const failedSurveys = useMemo(() => inSites(failed, workspaceSites).length, [failed, workspaceSites]);
  const redSites = useMemo(() => inSites(alerts, workspaceSites).length, [alerts, workspaceSites]);
  const countOf = (item: NavItem) => (item.href === "/globe" ? failedSurveys : item.href === "/reports" ? redSites : 0);
  const labelOf = (item: NavItem) => {
    const count = countOf(item);
    if (count === 0) return item.label;
    return item.href === "/reports"
      ? `${item.label}, ${count} ${count === 1 ? "site reconciles" : "sites reconcile"} red`
      : `${item.label}, ${count} failed to process`;
  };

  if (expanded) {
    return (
      <Sidebar aria-label="Primary">
        <div className={styles.brandRow}>
          <Link href="/globe" className={styles.brand}>
            <OrblodeLogo size={26} wordmarkClassName={styles.brandName} />
          </Link>
          <Tooltip content="Collapse the side panel" side="bottom">
            <IconButton
              icon={PanelLeftCloseIcon}
              aria-label="Collapse navigation"
              aria-expanded
              variant="bare"
              size="sm"
              onClick={onToggle}
              className={styles.brandEnd}
            />
          </Tooltip>
        </div>
        <div className={styles.workspaceRow}>
          <WorkspaceMenu />
        </div>
        <SidebarSection>
          {NAV.map((item) => (
            <SidebarItem
              key={item.href}
              as={Link}
              href={item.href}
              icon={item.icon}
              current={item.isActive(pathname)}
              badge={countOf(item) > 0 ? countOf(item) : undefined}
              aria-label={countOf(item) > 0 ? labelOf(item) : undefined}
              className={railDotClass(countOf(item) > 0, false)}
            >
              {item.label}
            </SidebarItem>
          ))}
        </SidebarSection>
        <SidebarFooter>
          <SidebarUser name={name} email={user?.name?.trim() ? user.email : undefined} avatar={<Avatar name={name} src={user?.avatar_url} />} menu={<UserMenu />} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar aria-label="Primary">
      <div className={styles.railHead}>
        <Tooltip content="Expand the side panel" side="right">
          <IconButton icon={PanelLeftOpenIcon} aria-label="Expand navigation" aria-expanded={false} variant="bare" size="sm" onClick={onToggle} />
        </Tooltip>
      </div>
      <div className={styles.workspaceRow}>
        <WorkspaceMenu compact />
      </div>
      <SidebarSection>
        {NAV.map((item) => (
          <Tooltip key={item.href} content={labelOf(item)} side="right">
            <SidebarItem
              as={Link}
              href={item.href}
              icon={item.icon}
              current={item.isActive(pathname)}
              aria-label={labelOf(item)}
              className={railDotClass(countOf(item) > 0, true)}
            >
              <span className="visually-hidden">{item.label}</span>
            </SidebarItem>
          </Tooltip>
        ))}
      </SidebarSection>
      <div className={styles.railFoot}>
        <Tooltip content={name} side="right">
          <Link href="/settings" aria-label="Account settings" className={styles.railAvatar}>
            <Avatar name={name} src={user?.avatar_url} size={32} />
          </Link>
        </Tooltip>
      </div>
    </Sidebar>
  );
}
