"use client";

import { Button, Checkbox, Dialog, Field, HelperText, Input, Select } from "@puckoops/camelot";
import { useEffect, useState, type FormEvent } from "react";
import { refusalMessage } from "@/lib/api/client";
import { inviteMember, listTeams, type OrgMember, type OrgRole, type Team } from "@/lib/api/userSvc";
import { ORG_ROLES } from "@/lib/access/roles";
import { useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

const blank = { name: "", email: "", password: "", role: "member" as OrgRole, teamIds: [] as string[] };

/** Adds someone to the organisation with a role and, optionally, teams. A new address gets an account with the
 * temporary password and a verification email; an existing account keeps its own password. Mounted for each
 * opening, so it starts empty. */
export function InviteMemberDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (member: OrgMember) => void }) {
  const viewer = useOrgViewer();
  const [form, setForm] = useState(blank);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch((err) => {
        console.error("Failed to fetch teams:", err);
        setTeams([]);
      });
  }, []);

  const roles = ORG_ROLES.filter((r) => r.value !== "owner" || viewer?.can_manage_owners);
  const set = <K extends keyof typeof blank>(key: K, value: (typeof blank)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError("Fill in the name, the email and a temporary password.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const member = await inviteMember({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        team_ids: form.teamIds,
        verify_url: new URL("/verify", window.location.origin).toString(),
      });
      toast.success(`Added ${member.name || member.email}.`);
      onInvited(member);
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't add them. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !busy && onClose()}
      title="Add someone"
      description="They sign in with this email. Someone new gets an account with the temporary password and an email to confirm their address; someone with an account keeps their own password."
      width={520}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Add to organisation
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={254} />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters with an upper-case letter, a digit and a symbol. Used only for a new account.">
          <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} maxLength={72} autoComplete="new-password" />
        </Field>
        <Field label="Role" hint={ORG_ROLES.find((r) => r.value === form.role)?.description}>
          <Select value={form.role} onValueChange={(v) => set("role", v as OrgRole)} options={roles.map((r) => ({ value: r.value, label: r.label }))} />
        </Field>
        {teams.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="small mb-2 font-medium text-ink-1">Teams</legend>
            {teams.map((t) => (
              <Checkbox
                key={t.id}
                label={t.name}
                checked={form.teamIds.includes(t.id)}
                onCheckedChange={(on) => set("teamIds", on ? [...form.teamIds, t.id] : form.teamIds.filter((id) => id !== t.id))}
              />
            ))}
          </fieldset>
        )}
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </form>
    </Dialog>
  );
}
