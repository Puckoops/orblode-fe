"use client";

import { Field, Select } from "@puckoops/camelot";
import { useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { moveProject, type Project } from "@/lib/api/userSvc";
import { toast } from "@/lib/toast";
import { useWorkspaces } from "@/lib/workspaces/store";

/** Which workspace the site is in, and a move to another of the person's workspaces. */
export function MoveSite({ site, onMoved, className }: { site: Project; onMoved: () => void; className?: string }) {
  const workspaces = useWorkspaces((s) => s.workspaces);
  const refresh = useWorkspaces((s) => s.refresh);
  const [moving, setMoving] = useState(false);

  if (!workspaces || workspaces.length < 2) return null;

  const move = async (workspaceId: string) => {
    if (workspaceId === site.workspace_id || moving) return;
    const target = workspaces.find((w) => w.id === workspaceId);
    setMoving(true);
    try {
      await moveProject(site.id, workspaceId);
      toast.success(`Moved ${site.name} to ${target?.name ?? "the workspace"}.`);
      await refresh();
      onMoved();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't move the site. Try again."));
    } finally {
      setMoving(false);
    }
  };

  return (
    <Field
      className={className}
      label="Workspace"
      hint="Roles on the workspace reach the site, so moving it takes them away and brings the new workspace's. Roles given on the site itself stay."
    >
      <Select
        value={site.workspace_id || undefined}
        placeholder="Not in a workspace"
        disabled={moving}
        onValueChange={(id) => void move(id)}
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
      />
    </Field>
  );
}
