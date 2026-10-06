"use client";

import { Menu01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { Avatar, IconButton, Sidebar, SidebarBrand, SidebarFooter, SidebarItem, SidebarSection, SidebarUser, Tooltip } from "@puckoops/camelot";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import styles from "./shell.module.css";
import { NAV } from "./nav";
import { UserMenu } from "./UserMenu";

/** The global app rail: Sites, Upload and Outputs, then the signed-in person. Collapsed it shows icons only. */
export function AppRail({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const client = useAuthClient();
  const name = user?.name?.trim() || user?.email || "Account";

  if (expanded) {
    return (
      <Sidebar aria-label="Primary">
        <SidebarBrand
          name="ORBLODE"
          as={Link}
          href="/globe"
          end={<IconButton icon={SidebarLeftIcon} aria-label="Collapse navigation" aria-expanded variant="bare" size="sm" onClick={onToggle} />}
        />
        <SidebarSection>
          {NAV.map((item) => (
            <SidebarItem key={item.href} as={Link} href={item.href} icon={item.icon} current={item.isActive(pathname)}>
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
          <Tooltip key={item.href} content={item.label} side="right">
            <SidebarItem as={Link} href={item.href} icon={item.icon} current={item.isActive(pathname)} aria-label={item.label}>
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
