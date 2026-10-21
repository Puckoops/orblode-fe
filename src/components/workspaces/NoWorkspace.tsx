"use client";

import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { Button, EmptyState } from "@puckoops/camelot";
import { useState } from "react";
import { useOrgViewer } from "@/lib/organisation/store";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

/** For someone with access to no workspace: sites live in workspaces, which an owner or admin gives access to, and
 * which members may make while the organisation lets them. */
export function NoWorkspace({ className }: { className?: string }) {
  const mayCreate = useOrgViewer()?.can_create_workspaces ?? false;
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EmptyState
        className={className}
        icon={Briefcase01Icon}
        title="You don't have access to a workspace yet."
        description={
          mayCreate
            ? "Projects live in workspaces. Create one, or ask an owner or admin of your organisation to give you access to theirs."
            : "Projects live in workspaces. Ask an owner or admin of your organisation to give you access to one."
        }
        action={
          mayCreate ? (
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
              New workspace
            </Button>
          ) : undefined
        }
      />
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
