"use client";

import { Add01Icon, Briefcase01Icon, UserAdd01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Badge,
  Band,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  Field,
  formatIsoDate,
  HelperText,
  IconButton,
  Input,
  SearchSelect,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type IsoDate,
} from "@puckoops/camelot";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useConfirm, type ConfirmRequest } from "@/components/common/confirm";
import { NewWorkspaceDialog } from "@/components/workspaces/NewWorkspaceDialog";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { refusalMessage } from "@/lib/api/client";
import {
  addWorkspaceMembers,
  deleteWorkspace,
  listOrgPeople,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspace,
  type OrgPerson,
  type Workspace,
  type WorkspaceMember,
} from "@/lib/api/userSvc";
import { toast } from "@/lib/toast";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Name and description, and what the workspace is at a glance. */
function Details({ workspace }: { workspace: Workspace }) {
  const client = useAuthClient();
  const refresh = useWorkspaces((s) => s.refresh);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== workspace.name || description.trim() !== workspace.description;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the workspace a name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), description: description.trim() });
      await refresh();
      toast.success("Workspace saved.");
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the workspace. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={save} noValidate>
          <Field label="Name" error={error}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Description" hint="Optional. What the workspace's sites have in common.">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={saving} disabled={!changed}>
              Save
            </Button>
          </div>
        </form>
        <DescriptionList
          items={[
            { label: "Organisation", value: client?.company_name || client?.name || "—" },
            { label: "Sites", value: String(workspace.project_count) },
            { label: "Members", value: String(workspace.user_ids.length) },
            {
              label: "Default",
              value: workspace.is_default ? "Yes: sites made without a workspace, and people new to the organisation, land here" : "No",
            },
            { label: "Created", value: formatIsoDate(workspace.created_at.slice(0, 10) as IsoDate, true) },
          ]}
        />
      </div>
    </Card>
  );
}

function Members({ workspace, people, confirm }: { workspace: Workspace; people: OrgPerson[] | null; confirm: (r: ConfirmRequest) => void }) {
  const me = useAuthUser();
  const refresh = useWorkspaces((s) => s.refresh);
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listWorkspaceMembers(workspace.id)
      .then(setMembers)
      .catch((err) => {
        console.error("Failed to fetch workspace members:", err);
        setMembers([]);
      });
  }, [workspace.id]);

  useEffect(load, [load]);

  const inIt = new Set(members?.map((m) => m.user_id));
  const candidates = (people ?? []).filter((p) => p.is_active && !inIt.has(p.id));

  const add = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      await addWorkspaceMembers(workspace.id, [adding]);
      setAdding(null);
      load();
      await refresh();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't add them. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = (member: WorkspaceMember) => {
    const self = member.user_id === me?.id;
    const who = self ? "yourself" : member.name || member.email || "this person";
    confirm({
      title: `Remove ${who} from ${workspace.name}?`,
      description: self
        ? "You stop seeing its sites, unless you're an admin of the organisation, and lose your roles on them."
        : "They stop seeing its sites and lose their roles on them. Their account stays.",
      confirmLabel: "Remove",
      onConfirm: async () => {
        try {
          await removeWorkspaceMember(workspace.id, member.user_id);
          load();
          await refresh();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't remove them. Try again."));
        }
      },
    });
  };

  if (!members) return <Skeleton height={96} />;

  return (
    <div className="flex flex-col gap-4">
      <Table minWidth={300}>
        <THead>
          <Tr>
            <Th>Member</Th>
            <Th>
              <span className="visually-hidden">Actions</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {members.map((m) => (
            <Tr key={m.user_id}>
              <Td primary>
                <span className="block">
                  {m.name || m.email || "Unknown account"}
                  {m.user_id === me?.id && <span className="text-ink-4"> (you)</span>}
                </span>
                {m.name && m.email && <span className="caption text-ink-4">{m.email}</span>}
              </Td>
              <Td className="text-right">
                <IconButton icon={UserRemove01Icon} aria-label={`Remove ${m.name || m.email || "member"}`} variant="bare" size="sm" onClick={() => remove(m)} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {members.length === 0 && <HelperText>Nobody yet. Admins of the organisation still see it.</HelperText>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Add someone from your organisation" className="min-w-64 flex-1">
          <SearchSelect
            value={adding}
            onValueChange={setAdding}
            disabled={busy || people === null}
            placeholder={people === null ? "Loading people…" : "Choose a person…"}
            searchPlaceholder="Find someone"
            options={candidates.map((p) => ({ value: p.id, label: p.name || p.email, meta: p.name ? p.email : undefined }))}
            empty={(query) => (query ? `Nobody matches “${query}”.` : "Everyone in the organisation is already in it.")}
          />
        </Field>
        <Button variant="ghost" iconStart={UserAdd01Icon} loading={busy} disabled={!adding} onClick={() => void add()}>
          Add
        </Button>
      </div>
    </div>
  );
}

/** Every workspace the person sees, to open one or start another. */
function AllWorkspaces({ onNew }: { onNew: () => void }) {
  const workspaces = useWorkspaces((s) => s.workspaces) ?? [];
  const currentId = useWorkspaces((s) => s.currentId);
  const select = useWorkspaces((s) => s.select);

  return (
    <Table minWidth={360}>
      <THead>
        <Tr>
          <Th>Workspace</Th>
          <Th>Sites</Th>
          <Th>Members</Th>
          <Th>
            <Button variant="quiet" size="sm" iconStart={Add01Icon} onClick={onNew}>
              New
            </Button>
          </Th>
        </Tr>
      </THead>
      <TBody>
        {workspaces.map((w) => (
          <Tr key={w.id}>
            <Td primary>
              <span className="inline-flex flex-wrap items-center gap-2">
                {w.name}
                {w.is_default && <Badge variant="tag">Default</Badge>}
              </span>
            </Td>
            <Td>
              <span className="num-sm">{w.project_count}</span>
            </Td>
            <Td>
              <span className="num-sm">{w.user_ids.length}</span>
            </Td>
            <Td className="text-right">
              {w.id === currentId ? (
                <Badge variant="tag">Open</Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => void select(w.id)}>
                  Open
                </Button>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function DeleteWorkspace({ workspace, confirm }: { workspace: Workspace; confirm: (r: ConfirmRequest) => void }) {
  const refresh = useWorkspaces((s) => s.refresh);
  const keptBecause = workspace.is_default
    ? "Every organisation keeps its default workspace."
    : workspace.project_count > 0
      ? `Move its ${plural(workspace.project_count, "site", "sites")} to another workspace first, from each site's panel.`
      : null;

  const remove = () =>
    confirm({
      title: `Delete ${workspace.name}?`,
      description: "It has no sites. Its members keep their accounts and their other workspaces; you'll be taken to another workspace.",
      onConfirm: async () => {
        try {
          await deleteWorkspace(workspace.id);
          toast.success(`Deleted ${workspace.name}.`);
          await refresh();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't delete the workspace. Try again."));
        }
      },
    });

  return (
    <Card>
      <div className="flex flex-col items-start gap-3">
        <p className="small text-ink-2">{keptBecause ?? "The workspace goes for everyone in it. Only a workspace with no sites can be deleted."}</p>
        <Button variant="ghost" disabled={keptBecause !== null} onClick={remove}>
          Delete workspace
        </Button>
      </div>
    </Card>
  );
}

/** Settings for the open workspace: its details, its members, the other workspaces, and deleting it. */
export function WorkspaceSettings() {
  const workspaces = useWorkspaces((s) => s.workspaces);
  const unavailable = useWorkspaces((s) => s.unavailable);
  const current = useCurrentWorkspace();
  const { confirm, confirmDialog } = useConfirm();
  const [people, setPeople] = useState<OrgPerson[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listOrgPeople()
      .then(setPeople)
      .catch((err) => {
        console.error("Failed to fetch the organisation's people:", err);
        setPeople([]);
      });
  }, []);

  if (unavailable) {
    return (
      <Band first heading="Workspace">
        <Alert tone="warning" title="Workspaces couldn't load">
          Every site of the organisation shows meanwhile. Reload the page to try again.
        </Alert>
      </Band>
    );
  }
  if (workspaces === null) {
    return (
      <Band first heading="Workspace">
        <Skeleton height={148} />
      </Band>
    );
  }

  const dialog = <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />;
  if (!current) {
    return (
      <Band first heading="Workspace">
        <EmptyState
          framed
          icon={Briefcase01Icon}
          title="You're not in a workspace yet."
          description="Sites live in workspaces. Create one, or ask someone in your organisation to add you to theirs."
          action={
            <Button variant="ghost" onClick={() => setCreating(true)}>
              New workspace
            </Button>
          }
        />
        {dialog}
      </Band>
    );
  }

  return (
    <>
      <Band
        first
        eyebrow="Workspace"
        heading={current.name}
        caption="The workspace open now. Its members see every site in it; what someone can do on a site is still their role there. Switch workspace from the top of the side panel."
      >
        <Details key={current.id} workspace={current} />
      </Band>
      <Band heading="Members" caption="People from your organisation in this workspace. Admins of the organisation see every workspace.">
        <Members key={current.id} workspace={current} people={people} confirm={confirm} />
      </Band>
      <Band heading="Your workspaces" caption="Anyone in the organisation can start one.">
        <AllWorkspaces onNew={() => setCreating(true)} />
      </Band>
      <Band heading="Delete workspace">
        <DeleteWorkspace workspace={current} confirm={confirm} />
      </Band>
      {confirmDialog}
      {dialog}
    </>
  );
}
