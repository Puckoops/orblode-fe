"use client";

import { Menu01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { Avatar, IconButton, Sidebar, SidebarFooter, SidebarItem, SidebarSection, SidebarUser, Tooltip } from "@puckoops/camelot";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { useProcessing } from "@/lib/processing/store";
import { useSiteAlerts } from "@/lib/reports/alerts";
import styles from "./shell.module.css";
import { NAV, type NavItem } from "./nav";
import { railDotClass } from "./railDot";
import { UserMenu } from "./UserMenu";

/** The global app rail: Sites, Upload, Outputs and Reports, then the signed-in person. Collapsed it shows icons only. */
export function AppRail({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const client = useAuthClient();
  const name = user?.name?.trim() || user?.email || "Account";
  const failedSurveys = useProcessing((s) => s.failed.length);
  const redSites = useSiteAlerts((s) => s.sites.length);
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
          <IconButton
            icon={SidebarLeftIcon}
            aria-label="Collapse navigation"
            aria-expanded
            variant="bare"
            size="sm"
            onClick={onToggle}
            className={styles.brandEnd}
          />
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
        <SidebarFooter note={client?.company_name?.trim() || client?.name?.trim() || undefined}>
          <SidebarUser name={name} email={user?.name?.trim() ? user.email : undefined} avatar={<Avatar name={name} />} menu={<UserMenu />} />
        </SidebarFooter>
      </Sidebar>
    );
  }

  return (
    <Sidebar aria-label="Primary">
      <div className={styles.railHead}>
        <IconButton icon={Menu01Icon} aria-label="Expand navigation" aria-expanded={false} variant="bare" onClick={onToggle} />
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
            <Avatar name={name} size={32} />
          </Link>
        </Tooltip>
      </div>
    </Sidebar>
  );
}
