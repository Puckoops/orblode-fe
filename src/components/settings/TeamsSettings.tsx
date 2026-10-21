"use client";

import { Add01Icon, ArrowLeft01Icon, Logout01Icon, UserAdd01Icon, UserGroupIcon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import {
  Badge,
  Band,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  HelperText,
  Icon,
  IconButton,
  Input,
  SearchSelect,
  Select,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useConfirm } from "@/components/common/confirm";
import { TeamVendor } from "@/components/mm/TeamVendor";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { refusalMessage } from "@/lib/api/client";
import {
  createTeam,
  deleteTeam,
  getTeam,
  listOrgMembers,
  listTeams,
  removeTeamMember,
  setTeamMember,
  updateTeam,
  type OrgMember,
  type Team,
  type TeamDetail,
  type TeamRole,
} from "@/lib/api/userSvc";
import { describeRoles } from "@/lib/access/roles";
import { useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

const TEAM_ROLES: { value: TeamRole; label: string }[] = [
  { value: "maintainer", label: "Maintainer" },
  { value: "member", label: "Member" },
];

const teamRoleLabel = (role: TeamRole) => TEAM_ROLES.find((r) => r.value === role)?.label ?? role;

/** Mounted for each opening, so it starts empty. */
function NewTeamDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (team: TeamDetail) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError("Give the team a name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const team = await createTeam({ name: name.trim(), description: description.trim() });
      toast.success(`Created ${team.name}.`);
      onCreated(team);
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't create the team. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !busy && onClose()}
      title="New team"
      description="A group of people you give access to in one go. You're its first maintainer."
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            Create team
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Surveyors" autoFocus />
        </Field>
        <Field label="Description" hint="Optional. Who is in it, or what they do.">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </Field>
      </form>
    </Dialog>
  );
}

function TeamList({ onOpen }: { onOpen: (id: string) => void }) {
  const viewer = useOrgViewer();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listTeams()
      .then(setTeams)
      .catch((err) => {
        console.error("Failed to fetch teams:", err);
        setTeams([]);
      });
  }, []);

  const mayCreate = viewer?.can_create_teams ?? false;
  return (
    <Band
      first
      heading="Teams"
      caption="Groups of people. Give a team a role on a workspace or a project and everyone in it has that role; whoever joins later has it too."
      actions={
        mayCreate ? (
          <Button variant="primary" iconStart={Add01Icon} onClick={() => setCreating(true)}>
            New team
          </Button>
        ) : undefined
      }
    >
      {!teams ? (
        <Skeleton height={148} />
      ) : teams.length === 0 ? (
        <EmptyState
          framed
          icon={UserGroupIcon}
          title="No teams yet."
          description={mayCreate ? "Make one for each group that works the same projects, such as a survey crew." : "Owners and admins can make teams."}
        />
      ) : (
        <Table minWidth={420}>
          <THead>
            <Tr>
              <Th>Team</Th>
              <Th>People</Th>
              <Th>You</Th>
              <Th>
                <span className="visually-hidden">Open</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {teams.map((t) => (
              <Tr key={t.id}>
                <Td primary>
                  <span className="block">{t.name}</span>
                  {t.description && <span className="caption block text-ink-4">{t.description}</span>}
                </Td>
                <Td>
                  <span className="num-sm">{t.member_count}</span>
                </Td>
                <Td>{t.viewer_role ? teamRoleLabel(t.viewer_role) : <span className="text-ink-4">—</span>}</Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onOpen(t.id)}>
                    Open
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      {creating && <NewTeamDialog onClose={() => setCreating(false)} onCreated={(team) => onOpen(team.id)} />}
    </Band>
  );
}

function TeamPage({ id, onBack }: { id: string; onBack: () => void }) {
  const viewer = useOrgViewer();
  const minorMinerals = useMinorMinerals();
  const { confirm, confirmDialog } = useConfirm();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [people, setPeople] = useState<OrgMember[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getTeam(id)
      .then((t) => {
        setTeam(t);
        setName(t.name);
        setDescription(t.description);
      })
      .catch((err) => {
        console.error("Failed to fetch the team:", err);
        setMissing(true);
      });
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    if (!team?.can_manage) return;
    listOrgMembers()
      .then(setPeople)
      .catch((err) => {
        console.error("Failed to fetch the organisation's people:", err);
        setPeople([]);
      });
  }, [team?.can_manage]);

  if (missing) {
    return (
      <Band first heading="Team">
        <EmptyState
          framed
          icon={UserGroupIcon}
          title="This team isn’t here any more."
          action={
            <Button variant="ghost" onClick={onBack}>
              All teams
            </Button>
          }
        />
      </Band>
    );
  }
  if (!team) {
    return (
      <Band first heading="Team">
        <Skeleton height={148} />
      </Band>
    );
  }

  const run = async (work: () => Promise<TeamDetail | void>, failure: string) => {
    setBusy(true);
    try {
      const next = await work();
      if (next) setTeam(next);
      else load();
    } catch (err) {
      toast.error(refusalMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the team a name.");
    void run(() => updateTeam(team.id, { name: name.trim(), description: description.trim() }), "Couldn't save the team. Try again.");
  };

  const inTeam = new Set(team.members.map((m) => m.user_id));
  const candidates = (people ?? []).filter((p) => !inTeam.has(p.user_id));

  const remove = (userId: string, label: string) => {
    const self = userId === viewer?.user_id;
    confirm({
      title: self ? `Leave ${team.name}?` : `Take ${label} out of ${team.name}?`,
      description: self ? "You lose every role the team gives you." : "They lose every role the team gives them. Their own roles stay.",
      confirmLabel: self ? "Leave" : "Take out",
      onConfirm: async () => {
        try {
          await removeTeamMember(team.id, userId);
          if (self && !team.can_manage) onBack();
          else load();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't change the team. Try again."));
        }
      },
    });
  };

  const removeTeam = () =>
    confirm({
      title: `Delete ${team.name}?`,
      description: "Everyone in it loses the roles the team gave them. Their own roles and their accounts stay.",
      onConfirm: async () => {
        try {
          await deleteTeam(team.id);
          toast.success(`Deleted ${team.name}.`);
          onBack();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't delete the team. Try again."));
        }
      },
    });

  return (
    <>
      <Band
        first
        eyebrow={
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-ink-3 hover:text-ink-1">
            <Icon icon={ArrowLeft01Icon} size={14} /> All teams
          </button>
        }
        heading={team.name}
        caption={team.description || undefined}
      >
        {team.can_manage ? (
          <Card>
            <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={save} noValidate>
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </Field>
              <Field label="Description" hint="Optional.">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
              </Field>
              <div>
                <Button type="submit" variant="primary" loading={busy} disabled={name.trim() === team.name && description.trim() === team.description}>
                  Save
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <HelperText>Only the team’s maintainers and the organisation’s owners and admins change it.</HelperText>
        )}
      </Band>

      <Band heading="People" caption="Maintainers add and take out people and change the team; members only get its roles.">
        <div className="flex flex-col gap-4">
          <Table minWidth={360}>
            <THead>
              <Tr>
                <Th>Person</Th>
                <Th>Role</Th>
                <Th>
                  <span className="visually-hidden">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {team.members.map((m) => {
                const self = m.user_id === viewer?.user_id;
                const label = m.name || m.email || "Unknown account";
                return (
                  <Tr key={m.user_id}>
                    <Td primary>
                      <span className="block">
                        {label}
                        {self && <span className="text-ink-4"> (you)</span>}
                      </span>
                      {m.name && m.email && <span className="caption block text-ink-4">{m.email}</span>}
                    </Td>
                    <Td>
                      {team.can_manage ? (
                        <Select
                          aria-label={`${label}'s role in the team`}
                          value={m.role}
                          disabled={busy}
                          onValueChange={(v) => void run(() => setTeamMember(team.id, m.user_id, v as TeamRole), "Couldn't change their role. Try again.")}
                          options={TEAM_ROLES}
                        />
                      ) : (
                        teamRoleLabel(m.role)
                      )}
                    </Td>
                    <Td className="text-right">
                      {(team.can_manage || self) && (
                        <IconButton
                          icon={self ? Logout01Icon : UserRemove01Icon}
                          aria-label={self ? "Leave the team" : `Take ${label} out`}
                          variant="bare"
                          size="sm"
                          onClick={() => remove(m.user_id, label)}
                        />
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {team.members.length === 0 && <HelperText>Nobody yet.</HelperText>}
          {team.can_manage && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Add someone from your organisation" className="min-w-64 flex-1">
                <SearchSelect
                  value={adding}
                  onValueChange={setAdding}
                  disabled={busy || people === null}
                  placeholder={people === null ? "Loading people…" : "Choose a person…"}
                  searchPlaceholder="Find someone"
                  options={candidates.map((p) => ({ value: p.user_id, label: p.name || p.email || "Unknown account", meta: p.name ? p.email : undefined }))}
                  empty={(query) => (query ? `Nobody matches “${query}”.` : "Everyone in the organisation is already in it.")}
                />
              </Field>
              <Button
                variant="ghost"
                iconStart={UserAdd01Icon}
                loading={busy}
                disabled={!adding}
                onClick={() => {
                  if (!adding) return;
                  const who = adding;
                  setAdding(null);
                  void run(() => setTeamMember(team.id, who, "member"), "Couldn't add them. Try again.");
                }}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </Band>

      {minorMinerals && (
        <Band heading="Drone vendor" caption="Whether the team flies the open workspace's missions, and its drones.">
          <TeamVendor team={team} />
        </Band>
      )}

      <Band heading="Access" caption="Where the team holds roles. Give or take them away in each workspace's settings or each project's panel.">
        {team.access.length === 0 ? (
          <HelperText>The team holds no roles yet.</HelperText>
        ) : (
          <Table minWidth={360}>
            <THead>
              <Tr>
                <Th>Where</Th>
                <Th>Roles</Th>
              </Tr>
            </THead>
            <TBody>
              {team.access.map((a) => (
                <Tr key={`${a.type}:${a.id}`}>
                  <Td primary>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {a.name}
                      <Badge variant="tag">{a.type === "workspace" ? "Workspace" : "Project"}</Badge>
                    </span>
                  </Td>
                  <Td>{describeRoles(a.roles, a.type)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Band>

      {team.can_manage && (
        <Band heading="Delete team">
          <Card>
            <div className="flex flex-col items-start gap-3">
              <p className="small text-ink-2">Everyone in it loses the roles the team gave them.</p>
              <Button variant="ghost" onClick={removeTeam}>
                Delete team
              </Button>
            </div>
          </Card>
        </Band>
      )}
      {confirmDialog}
    </>
  );
}

/** Teams: the list, or one team when `teamId` names it. */
export function TeamsSettings({ teamId, onOpen }: { teamId: string | null; onOpen: (id: string | null) => void }) {
  return teamId ? <TeamPage key={teamId} id={teamId} onBack={() => onOpen(null)} /> : <TeamList onOpen={onOpen} />;
}
