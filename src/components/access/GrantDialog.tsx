"use client";

import { Button, Checkbox, Dialog, Field, HelperText, SearchSelect, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { refusalMessage } from "@/lib/api/client";
import { listOrgMembers, listTeams, removeAccess, setAccess, setCustomAccess, type AccessEntry, type AccessScope, type OrgMember, type Team } from "@/lib/api/userSvc";
import { grantableSubjects, parseSubjectKey, ROLES, rolesFor, subjectKey } from "@/lib/access/roles";
import { useCustomRoles } from "@/lib/access/customRoles";
import { useOrganisation } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

/** Gives a person, a team or everyone in the organisation roles on a workspace or a site, or changes the roles
 * of someone who has them already (`editing`). Mounted for each opening, so it starts empty or as `editing` is. */
export function GrantDialog({
  onClose,
  scope,
  objectId,
  objectName,
  granted,
  editing,
  onSaved,
}: {
  onClose: () => void;
  scope: AccessScope;
  objectId: string;
  objectName: string;
  granted: AccessEntry[];
  editing: (AccessEntry & { custom?: string[] }) | null;
  onSaved: (entries: AccessEntry[]) => void;
}) {
  const customRoles = useCustomRoles((s) => s.roles);
  const minorMinerals = useMinorMinerals();
  const loadCustomRoles = useCustomRoles((s) => s.load);
  const [custom, setCustom] = useState<string[]>(editing?.custom ?? []);
  const organisation = useOrganisation((s) => s.organisation);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [people, setPeople] = useState<OrgMember[] | null>(null);
  const [subject, setSubject] = useState<string | null>(editing ? subjectKey(editing.subject.type, editing.subject.id) : null);
  const [roles, setRoles] = useState<string[]>(editing ? editing.roles : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadCustomRoles();
  }, [loadCustomRoles]);

  useEffect(() => {
    if (editing) return;
    Promise.all([listTeams(), listOrgMembers()])
      .then(([t, p]) => {
        setTeams(t);
        setPeople(p);
      })
      .catch((err) => {
        console.error("Failed to fetch teams and people:", err);
        setTeams([]);
        setPeople([]);
      });
  }, [editing]);

  const everyone = subject?.startsWith("organisation:") ?? false;
  const choices = rolesFor(scope);
  const options =
    teams && people && organisation ? grantableSubjects(scope, { id: organisation.id, name: organisation.name }, teams, people, granted) : null;

  const toggle = (role: string, on: boolean) => setRoles((held) => (on ? [...held, role] : held.filter((r) => r !== role)));
  const toggleCustom = (id: string, on: boolean) => setCustom((held) => (on ? [...held, id] : held.filter((r) => r !== id)));

  const save = async () => {
    if (!subject) {
      setError("Choose who gets access.");
      return;
    }
    if (roles.length === 0 && custom.length === 0) {
      setError("Choose at least one role.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const who = parseSubjectKey(subject);
      let entries = granted;
      if (roles.length > 0) entries = await setAccess(scope, objectId, who, roles);
      else if (editing && editing.roles.length > 0) await removeAccess(scope, objectId, who);
      const customBefore = editing?.custom ?? [];
      if (who.type !== "organisation" && (custom.length !== customBefore.length || custom.some((id) => !customBefore.includes(id)))) {
        await setCustomAccess(scope, objectId, who, custom);
      }
      toast.success(editing ? "Access changed." : "Access given.");
      onSaved(entries);
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't change access. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !busy && onClose()}
      title={editing ? `${editing.subject.name}’s roles` : "Give access"}
      description={
        scope === "workspace"
          ? `Roles on ${objectName} reach every site in it.`
          : `Roles on ${objectName} only. Roles from its workspace show separately and change there.`
      }
      width={520}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {editing ? "Save" : "Give access"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!editing && (
          <Field label="Who">
            {options === null ? (
              <Skeleton height={40} />
            ) : (
              <SearchSelect
                value={subject}
                onValueChange={(value) => {
                  setSubject(value);
                  if (value.startsWith("organisation:")) setRoles(["client_viewer"]);
                }}
                placeholder="A person, a team or everyone"
                searchPlaceholder="Find a person or team"
                options={options}
                empty={(query) => (query ? `Nobody matches “${query}”.` : "Everyone already has access here.")}
              />
            )}
          </Field>
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="small mb-2 font-medium text-ink-1">Roles</legend>
          {choices.map((role) => (
            <div key={role} className="flex flex-col gap-1">
              <Checkbox
                label={ROLES[role].label}
                checked={roles.includes(role)}
                disabled={busy || (everyone && role !== "client_viewer")}
                onCheckedChange={(on) => toggle(role, on)}
              />
              <span className="caption pl-7 text-ink-4">{ROLES[role].description}</span>
            </div>
          ))}
          {everyone && <HelperText>Everyone in the organisation can be a viewer only.</HelperText>}
        </fieldset>
        {customRoles && customRoles.length > 0 && !everyone && (
          <fieldset className="flex flex-col gap-3">
            <legend className="small mb-2 font-medium text-ink-1">Custom roles</legend>
            {customRoles.map((role) => (
              <div key={role.id} className="flex flex-col gap-1">
                <Checkbox label={role.name} checked={custom.includes(role.id)} disabled={busy} onCheckedChange={(on) => toggleCustom(role.id, on)} />
                {role.description && <span className="caption pl-7 text-ink-4">{role.description}</span>}
              </div>
            ))}
          </fieldset>
        )}
        {minorMinerals && customRoles?.length === 0 && !everyone && (
          <HelperText>
            Officials and vendors usually hold a custom role: make one from the Authority reviewer or Field vendor template in{" "}
            <Link href="/settings?tab=roles">Settings → Roles</Link>.
          </HelperText>
        )}
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}
