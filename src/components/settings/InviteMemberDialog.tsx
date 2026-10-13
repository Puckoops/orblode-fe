"use client";

import { Button, Checkbox, Dialog, Field, HelperText, Input, Select } from "@puckoops/camelot";
import { useEffect, useState, type FormEvent } from "react";
import { refusalMessage } from "@/lib/api/client";
import { invitePageUrl, inviteMember, listTeams, type InviteResult, type OrgRole, type Team } from "@/lib/api/userSvc";
import { ORG_ROLES } from "@/lib/access/roles";
import { looksLikeEmail } from "@/lib/email";
import { useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

/** Adds someone to the organisation by email with a role and, optionally, teams. Someone with an account joins at
 * once and is told by email; someone with none is emailed an invitation to set one up. Mounted for each opening,
 * so it starts empty. */
export function InviteMemberDialog({ onClose, onInvited }: { onClose: () => void; onInvited: (result: InviteResult) => void }) {
  const viewer = useOrgViewer();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [teamIds, setTeamIds] = useState<string[]>([]);
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

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!looksLikeEmail(email.trim())) {
      setError("Enter their email address.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await inviteMember({ email: email.trim(), role, team_ids: teamIds, invite_url: invitePageUrl() });
      toast.success(
        result.status === "added"
          ? `Added ${result.member.name || result.member.email}. We emailed them to let them know.`
          : `Invitation sent to ${result.invitation.email}.`,
      );
      onInvited(result);
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
      description="If they already use Orblode, they join straight away. If not, we email them an invitation to set up their account."
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
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoFocus />
        </Field>
        <Field label="Role" hint={ORG_ROLES.find((r) => r.value === role)?.description}>
          <Select value={role} onValueChange={(v) => setRole(v as OrgRole)} options={roles.map((r) => ({ value: r.value, label: r.label }))} />
        </Field>
        {teams.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="small mb-2 font-medium text-ink-1">Teams</legend>
            {teams.map((t) => (
              <Checkbox
                key={t.id}
                label={t.name}
                checked={teamIds.includes(t.id)}
                onCheckedChange={(on) => setTeamIds((ids) => (on ? [...ids, t.id] : ids.filter((id) => id !== t.id)))}
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
