"use client";

import { Cancel01Icon, Logout01Icon, UserAdd01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { Badge, Band, Button, HelperText, IconButton, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { useCallback, useEffect, useState } from "react";
import { useConfirm, type ConfirmRequest } from "@/components/common/confirm";
import { refusalMessage } from "@/lib/api/client";
import { signOut } from "@/lib/auth";
import {
  changeMemberRole,
  invitePageUrl,
  listInvitations,
  listOrgMembers,
  removeOrgMember,
  resendInvitation,
  revokeInvitation,
  type Invitation,
  type OrgMember,
  type OrgRole,
} from "@/lib/api/userSvc";
import { canRemove, ORG_ROLES, orgRoleChoices, orgRoleLabel } from "@/lib/access/roles";
import { useOrganisation, useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";
import { formatSurveyDate } from "@/lib/utils";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { LastActive } from "./LastActive";

/**
 * Runs load, and again whenever key changes, someone joins (the notice bumps the organisation's
 * people) or the page comes back into view, since people join from elsewhere.
 */
function useReloadOnChange(load: () => void, key = 0) {
  const membersVersion = useOrganisation((s) => s.membersVersion);
  useEffect(load, [load, membersVersion, key]);
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", reload);
    return () => document.removeEventListener("visibilitychange", reload);
  }, [load]);
}

/** Invitations sent to people with no account yet, until they accept: resend one for a new link, or revoke it. */
function PendingInvitations({ refreshKey, confirm }: { refreshKey: number; confirm: (request: ConfirmRequest) => void }) {
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    listInvitations()
      .then(setInvitations)
      .catch((err) => {
        console.error("Failed to fetch invitations:", err);
        setInvitations([]);
      });
  }, []);

  useReloadOnChange(load, refreshKey);

  if (!invitations || invitations.length === 0) return null;

  const resend = async (inv: Invitation) => {
    setBusy(inv.id);
    try {
      await resendInvitation(inv.id, invitePageUrl());
      toast.success(`Sent ${inv.email} a new link.`);
      load();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't send it again. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const revoke = (inv: Invitation) =>
    confirm({
      title: `Revoke the invitation to ${inv.email}?`,
      description: "Its link stops working. You can invite them again later.",
      confirmLabel: "Revoke",
      onConfirm: async () => {
        try {
          await revokeInvitation(inv.id);
          load();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't revoke it. Try again."));
        }
      },
    });

  return (
    <Band heading="Invitations" caption="Sent to people who don't use Orblode yet. Each link works for 7 days; sending it again makes a new one.">
      <Table minWidth={560}>
        <THead>
          <Tr>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Invited by</Th>
            <Th>Link</Th>
            <Th>
              <span className="visually-hidden">Actions</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {invitations.map((inv) => (
            <Tr key={inv.id}>
              <Td primary>
                <span className="block">{inv.email}</span>
                {inv.teams.length > 0 && <span className="caption block text-ink-4">{inv.teams.map((t) => t.name).join(", ")}</span>}
              </Td>
              <Td>{orgRoleLabel(inv.role)}</Td>
              <Td>{inv.invited_by || <span className="text-ink-4">—</span>}</Td>
              <Td>
                {inv.expired ? (
                  <span className="text-ink-4">Expired</span>
                ) : (
                  <span className="num-sm">Until {formatSurveyDate(inv.expires_at.slice(0, 10))}</span>
                )}
              </Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="sm" loading={busy === inv.id} onClick={() => void resend(inv)}>
                  Send again
                </Button>
                <IconButton icon={Cancel01Icon} aria-label={`Revoke the invitation to ${inv.email}`} variant="bare" size="sm" onClick={() => revoke(inv)} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Band>
  );
}

/** Re-renders every minute, so relative times stay true while the page is open. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(every);
  }, []);
  return now;
}

/** The organisation's people: their role, their teams, adding someone, changing a role and removing someone. */
export function PeopleSettings() {
  const viewer = useOrgViewer();
  const organisation = useOrganisation((s) => s.organisation);
  const refreshOrganisation = useOrganisation((s) => s.refresh);
  const { confirm, confirmDialog } = useConfirm();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invitationsKey, setInvitationsKey] = useState(0);
  const [changing, setChanging] = useState<string | null>(null);
  const now = useNow();

  const load = useCallback(() => {
    listOrgMembers()
      .then(setMembers)
      .catch((err) => {
        console.error("Failed to fetch the organisation's people:", err);
        setMembers([]);
      });
  }, []);

  useReloadOnChange(load);

  const owners = members?.filter((m) => m.role === "owner").length ?? 0;

  const changeRole = async (member: OrgMember, role: OrgRole) => {
    if (role === member.role) return;
    setChanging(member.user_id);
    try {
      await changeMemberRole(member.user_id, role);
      toast.success(`Changed ${member.name || member.email}'s role to ${orgRoleLabel(role)}.`);
      load();
      if (member.user_id === viewer?.user_id) await refreshOrganisation();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't change their role. Try again."));
    } finally {
      setChanging(null);
    }
  };

  const remove = (member: OrgMember) => {
    const self = member.user_id === viewer?.user_id;
    const who = member.name || member.email || "this person";
    confirm({
      title: self ? `Leave ${organisation?.name ?? "the organisation"}?` : `Remove ${who}?`,
      description: self
        ? "You lose every role and team here, and your session here ends. Your account and your other organisations stay."
        : "They lose every role and team in the organisation, and are signed out of it within seconds. Their account stays, and you can add them again.",
      confirmLabel: self ? "Leave" : "Remove",
      onConfirm: async () => {
        try {
          await removeOrgMember(member.user_id);
          if (self) {
            await signOut();
            // A full navigation, so nothing of this organisation stays in memory.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/sign-in";
            return;
          }
          toast.success(`Removed ${who}.`);
          load();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't remove them. Try again."));
        }
      },
    });
  };

  return (
    <>
      <Band
        first
        heading="People"
        caption="Everyone in the organisation. Owners and admins add people and change roles; only owners make or remove owners."
        actions={
          viewer?.can_manage_people ? (
            <Button variant="primary" iconStart={UserAdd01Icon} onClick={() => setInviting(true)}>
              Add someone
            </Button>
          ) : undefined
        }
      >
        {!members ? (
          <Skeleton height={148} />
        ) : (
          <Table minWidth={560}>
            <THead>
              <Tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>Teams</Th>
                <Th>Last active</Th>
                <Th>
                  <span className="visually-hidden">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {members.map((m) => {
                const choices = orgRoleChoices(viewer, m.role);
                const self = m.user_id === viewer?.user_id;
                return (
                  <Tr key={m.user_id}>
                    <Td primary>
                      <span className="block">
                        {m.name || m.email || "Unknown account"}
                        {self && <span className="text-ink-4"> (you)</span>}
                      </span>
                      {m.name && m.email && <span className="caption block text-ink-4">{m.email}</span>}
                      {!m.is_verified && <span className="caption block text-ink-4">Hasn’t confirmed their email yet</span>}
                    </Td>
                    <Td>
                      {choices.length > 1 ? (
                        <Select
                          aria-label={`${m.name || m.email}'s role`}
                          value={m.role}
                          disabled={changing === m.user_id}
                          onValueChange={(v) => void changeRole(m, v as OrgRole)}
                          options={ORG_ROLES.filter((r) => choices.includes(r.value)).map((r) => ({ value: r.value, label: r.label }))}
                        />
                      ) : (
                        orgRoleLabel(m.role)
                      )}
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {m.teams.length === 0 ? (
                          <span className="text-ink-4">—</span>
                        ) : (
                          m.teams.map((t) => (
                            <Badge key={t.id} variant="tag">
                              {t.name}
                            </Badge>
                          ))
                        )}
                      </span>
                    </Td>
                    <Td>
                      <LastActive member={m} now={now} />
                    </Td>
                    <Td className="text-right">
                      {canRemove(viewer, m, owners) && (
                        <IconButton
                          icon={self ? Logout01Icon : UserRemove01Icon}
                          aria-label={self ? "Leave the organisation" : `Remove ${m.name || m.email || "them"}`}
                          variant="bare"
                          size="sm"
                          onClick={() => remove(m)}
                        />
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
        {members && owners === 1 && viewer?.role === "owner" && (
          <HelperText className="mt-3">You’re the only owner. Make someone else an owner before you step down or leave.</HelperText>
        )}
      </Band>
      {viewer?.can_manage_people && <PendingInvitations refreshKey={invitationsKey} confirm={confirm} />}
      {inviting && (
        <InviteMemberDialog
          onClose={() => setInviting(false)}
          onInvited={(result) => (result.status === "added" ? load() : setInvitationsKey((k) => k + 1))}
        />
      )}
      {confirmDialog}
    </>
  );
}
