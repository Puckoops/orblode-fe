"use client";

import { Add01Icon, Briefcase01Icon, Settings02Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { Icon, Menu, MenuItem, MenuLabel, MenuSeparator, Skeleton } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";
import styles from "@/components/shell/shell.module.css";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

/**
 * The workspace dropdown at the top of the left pane: the open workspace and its organisation, a
 * switch to any other, its settings and a new one. `compact` is the collapsed rail's icon-only form.
 */
export function WorkspaceMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const client = useAuthClient();
  const workspaces = useWorkspaces((s) => s.workspaces);
  const unavailable = useWorkspaces((s) => s.unavailable);
  const select = useWorkspaces((s) => s.select);
  const current = useCurrentWorkspace();
  const [creating, setCreating] = useState(false);
  const company = client?.company_name?.trim() || client?.name?.trim() || "";
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
          <button type="button" className={classes} title={compact ? name : undefined} aria-label={`Workspace: ${name}. Switch workspace`}>
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
        {workspaces.map((w) => (
          <MenuItem key={w.id} icon={w.id === current?.id ? Tick02Icon : Briefcase01Icon} onSelect={() => void select(w.id)}>
            {w.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        {current && (
          <MenuItem icon={Settings02Icon} onSelect={() => router.push("/settings?tab=workspace")}>
            Workspace settings
          </MenuItem>
        )}
        <MenuItem icon={Add01Icon} onSelect={() => setCreating(true)}>
          New workspace
        </MenuItem>
      </Menu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
