"use client";

import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { Button, EmptyState } from "@puckoops/camelot";
import { useState } from "react";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

/** For someone in no workspace: sites live in workspaces, and anyone in the organisation can make one. */
export function NoWorkspace({ className }: { className?: string }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <EmptyState
        className={className}
        icon={Briefcase01Icon}
        title="You're not in a workspace yet."
        description="Sites live in workspaces. Create one, or ask someone in your organisation to add you to theirs."
        action={
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            New workspace
          </Button>
        }
      />
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
