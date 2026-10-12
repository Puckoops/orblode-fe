"use client";

import { Button, Dialog, Field, Input } from "@puckoops/camelot";
import { useState, type FormEvent } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createWorkspace } from "@/lib/api/userSvc";
import { toast } from "@/lib/toast";
import { useWorkspaces } from "@/lib/workspaces/store";

/** Makes a workspace with the caller as its first member, and opens it. */
export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useWorkspaces((s) => s.refresh);
  const select = useWorkspaces((s) => s.select);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setName("");
      setDescription("");
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
      const created = await createWorkspace({ name: name.trim(), description: description.trim() });
      await refresh();
      await select(created.id);
      toast.success(`Created ${created.name}. Add people to it from its settings.`);
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
      description="A group of sites. You're its first member; everyone you add sees every site in it."
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
      </form>
    </Dialog>
  );
}
