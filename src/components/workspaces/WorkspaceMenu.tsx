"use client";

import { Add01Icon, Briefcase01Icon, Building03Icon, MountainIcon, Settings02Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { Badge, Icon, Menu, MenuItem, MenuLabel, MenuSeparator, Skeleton, toast } from "@puckoops/camelot";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { MINOR_MINERALS, useMinorMineralsLicence } from "@/hooks/useMinorMinerals";
import type { Workspace } from "@/lib/api/userSvc";
import { switchOrganisation } from "@/lib/auth";
import { organisationForClient, organisationLabel } from "@/lib/organisation/links";
import { useOrganisation, useOrgViewer } from "@/lib/organisation/store";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import styles from "@/components/shell/shell.module.css";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

/**
 * The workspace dropdown at the top of the left pane: the open workspace and its organisation, a
 * switch to any other workspace (each named with the organisation it belongs to) or, for someone in
 * several, organisation, the workspace's settings and a new one. `compact` is the collapsed rail's
 * icon-only form.
 */
export function WorkspaceMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const licensed = useMinorMineralsLicence();
  const client = useAuthClient();
  const workspaces = useWorkspaces((s) => s.workspaces);
  const unavailable = useWorkspaces((s) => s.unavailable);
  const select = useWorkspaces((s) => s.select);
  const current = useCurrentWorkspace();
  const mayCreate = useOrgViewer()?.can_create_workspaces ?? false;
  const organisations = useOrganisation((s) => s.mine);
  const [creating, setCreating] = useState(false);
  const [switching, setSwitching] = useState(false);

  const openOrganisation = async (id: string) => {
    setSwitching(true);
    const failed = await switchOrganisation(id);
    setSwitching(false);
    toast.error("Couldn’t open that organisation", failed);
  };
  const company = client?.company_name?.trim() || client?.name?.trim() || "";
  const isMM = (w: Workspace | null | undefined) => licensed && w?.type === MINOR_MINERALS;
  // Each kind of workspace has its own pages: opening one leaves the other kind's.
  const open = (w: Workspace) => {
    if (w.id === current?.id) return;
    void select(w.id);
    if (isMM(w)) router.push("/mm");
    else if (pathname.startsWith("/mm")) router.push("/overview");
  };
  const classes = `${styles.workspaceTrigger} ${compact ? styles.workspaceCompact : ""}`;

  const mark = (
    <span className={styles.workspaceMark}>
      <Icon icon={Briefcase01Icon} size={16} />
    </span>
  );

  if (unavailable || !workspaces) {
    return (
      <div className={classes} title={company || undefined}>
        {mark}
        <span className={styles.workspaceText}>
          {unavailable ? <span className={styles.workspaceName}>{company || "Orblode"}</span> : <Skeleton width={96} height={12} />}
        </span>
      </div>
    );
  }

  const name = current?.name ?? "No workspace";
  return (
    <>
      <Menu
        align="start"
        side={compact ? "right" : "bottom"}
        minWidth={248}
        trigger={
          <button type="button" className={classes} title={compact ? [name, company].filter(Boolean).join(" · ") : undefined} aria-label={`Workspace: ${name}${company ? `, ${company}` : ""}. Switch workspace`}>
            {mark}
            <span className={styles.workspaceText}>
              <span className={styles.workspaceName}>{name}</span>
              {company && <span className={styles.workspaceOrg}>{company}</span>}
            </span>
            <Icon icon={UnfoldMoreIcon} size={14} className={styles.workspaceChevron} />
          </button>
        }
      >
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((w) => {
          const organisation = organisationForClient(w.client_id, organisations, client);
          return (
            <MenuItem key={w.id} icon={w.id === current?.id ? Tick02Icon : isMM(w) ? MountainIcon : Briefcase01Icon} onSelect={() => open(w)}>
              <span className={styles.workspaceChoice}>
                <span className={styles.workspaceChoiceName}>{w.name}</span>
                {organisation && <span className={styles.workspaceChoiceOrg}>{organisation}</span>}
              </span>
            </MenuItem>
          );
        })}
        <MenuSeparator />
        {organisations && organisations.length > 1 && (
          <>
            <MenuLabel>Organisations</MenuLabel>
            {organisations.map((o) => (
              <MenuItem
                key={o.id}
                icon={o.current ? Tick02Icon : Building03Icon}
                disabled={switching}
                onSelect={() => !o.current && void openOrganisation(o.id)}
              >
                {organisationLabel(o)}
                {!o.current && !o.joined && (
                  <>
                    {" "}
                    <Badge variant="tag">New</Badge>
                  </>
                )}
              </MenuItem>
            ))}
            <MenuSeparator />
          </>
        )}
        {current && (
          <MenuItem icon={Settings02Icon} onSelect={() => router.push("/settings?tab=workspace")}>
            Workspace settings
          </MenuItem>
        )}
        {mayCreate && (
          <MenuItem icon={Add01Icon} onSelect={() => setCreating(true)}>
            New workspace
          </MenuItem>
        )}
      </Menu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
