"use client";

import { Button, Dialog, Field, Input, RadioGroup } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMinorMineralsLicence } from "@/hooks/useMinorMinerals";
import { refusalMessage } from "@/lib/api/client";
import { createWorkspace, type WorkspaceType } from "@/lib/api/userSvc";
import { toast } from "@/lib/toast";
import { useWorkspaces } from "@/lib/workspaces/store";

export const WORKSPACE_TYPES: { value: WorkspaceType; label: string; description: string }[] = [
  { value: "general", label: "General", description: "Sites, surveys, measurements and stockpile reports." },
  {
    value: "minor_minerals",
    label: "River sand and minor minerals",
    description: "Leases, drone missions, DGPS, replenishment studies and vetted reports, with their own vendors and drones.",
  },
];

/** Makes a workspace with the caller as its admin, and opens it. A licensed organisation chooses what it is for. */
export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const licensed = useMinorMineralsLicence();
  const refresh = useWorkspaces((s) => s.refresh);
  const select = useWorkspaces((s) => s.select);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkspaceType>("general");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setName("");
      setDescription("");
      setType("general");
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError("Give the workspace a name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const created = await createWorkspace({ name: name.trim(), description: description.trim(), ...(type !== "general" ? { type } : {}) });
      await refresh();
      await select(created.id);
      if (type === "minor_minerals") router.push("/mm");
      toast.success(`Created ${created.name}. Give people and teams access from its settings.`);
      setBusy(false);
      close(false);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't create the workspace. Try again."));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="New workspace"
      description="A group of sites. You're its admin; the people and teams you give a role here have it on every site in it."
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Create workspace
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Pilbara sites" autoFocus />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
        {licensed && (
          <Field label="What it’s for">
            <RadioGroup value={type} onValueChange={(v) => setType(v as WorkspaceType)} options={WORKSPACE_TYPES} aria-label="What the workspace is for" />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
