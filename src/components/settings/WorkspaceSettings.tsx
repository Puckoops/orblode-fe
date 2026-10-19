"use client";

import { Add01Icon, Briefcase01Icon } from "@hugeicons/core-free-icons";
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
  RadioGroup,
  Input,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  type IsoDate,
} from "@puckoops/camelot";
import { useState, type FormEvent } from "react";
import { AccessList } from "@/components/access/AccessList";
import { useConfirm, type ConfirmRequest } from "@/components/common/confirm";
import { NewWorkspaceDialog, WORKSPACE_TYPES } from "@/components/workspaces/NewWorkspaceDialog";
import { useAuthClient } from "@/hooks/useAuth";
import { useMinorMineralsLicence } from "@/hooks/useMinorMinerals";
import { refusalMessage } from "@/lib/api/client";
import { deleteWorkspace, updateWorkspace, type Workspace, type WorkspaceType } from "@/lib/api/userSvc";
import { useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";
import { useCurrentWorkspace, useWorkspaces } from "@/lib/workspaces/store";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Name, description and what it is for, and the workspace at a glance. */
function Details({ workspace }: { workspace: Workspace }) {
  const client = useAuthClient();
  const licensed = useMinorMineralsLicence();
  const refresh = useWorkspaces((s) => s.refresh);
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const savedType: WorkspaceType = workspace.type ?? "general";
  const [type, setType] = useState<WorkspaceType>(savedType);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== workspace.name || description.trim() !== workspace.description || type !== savedType;
  const mayType = licensed && workspace.can_manage && !workspace.is_default;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the workspace a name.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateWorkspace(workspace.id, { name: name.trim(), description: description.trim(), ...(type !== savedType ? { type } : {}) });
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
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!workspace.can_manage} />
          </Field>
          <Field label="Description" hint="Optional. What the workspace's sites have in common.">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} disabled={!workspace.can_manage} />
          </Field>
          {mayType && (
            <Field label="What it’s for">
              <RadioGroup value={type} onValueChange={(v) => setType(v as WorkspaceType)} options={WORKSPACE_TYPES} aria-label="What the workspace is for" />
            </Field>
          )}
          {mayType && savedType === "minor_minerals" && type === "general" && (
            <HelperText>Its leases, missions and studies stay, hidden, until it is a minor-minerals workspace again.</HelperText>
          )}
          {workspace.can_manage ? (
            <div>
              <Button type="submit" variant="primary" loading={saving} disabled={!changed}>
                Save
              </Button>
            </div>
          ) : (
            <HelperText>Only the workspace’s admins and the organisation’s owners and admins change it.</HelperText>
          )}
        </form>
        <DescriptionList
          items={[
            { label: "Organisation", value: client?.company_name || client?.name || "—" },
            { label: "Sites", value: String(workspace.project_count) },
            ...(licensed ? [{ label: "What it’s for", value: WORKSPACE_TYPES.find((t) => t.value === savedType)?.label ?? "General" }] : []),
            {
              label: "Default",
              value: workspace.is_default ? "Yes: sites made without a workspace land here, and everyone in the organisation can view it" : "No",
            },
            { label: "Created", value: formatIsoDate(workspace.created_at.slice(0, 10) as IsoDate, true) },
          ]}
        />
      </div>
    </Card>
  );
}

/** Every workspace the person sees, to open one or start another. */
function AllWorkspaces({ onNew }: { onNew: (() => void) | null }) {
  const workspaces = useWorkspaces((s) => s.workspaces) ?? [];
  const currentId = useWorkspaces((s) => s.currentId);
  const select = useWorkspaces((s) => s.select);

  return (
    <Table minWidth={360}>
      <THead>
        <Tr>
          <Th>Workspace</Th>
          <Th>Sites</Th>
          <Th>
            {onNew && (
              <Button variant="quiet" size="sm" iconStart={Add01Icon} onClick={onNew}>
                New
              </Button>
            )}
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
                {w.can_manage && <Badge variant="tag">Admin</Badge>}
              </span>
            </Td>
            <Td>
              <span className="num-sm">{w.project_count}</span>
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
  const keptBecause = !workspace.can_manage
    ? "Only the workspace's admins and the organisation's owners and admins delete it."
    : workspace.is_default
    ? "Every organisation keeps its default workspace."
    : workspace.project_count > 0
      ? `Move its ${plural(workspace.project_count, "site", "sites")} to another workspace first, from each site's panel.`
      : null;

  const remove = () =>
    confirm({
      title: `Delete ${workspace.name}?`,
      description: "It has no sites. Everyone with access to it keeps their account and their other workspaces; you'll be taken to another workspace.",
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
        <p className="small text-ink-2">{keptBecause ?? "The workspace goes for everyone with access to it. Only a workspace with no sites can be deleted."}</p>
        <Button variant="ghost" disabled={keptBecause !== null} onClick={remove}>
          Delete workspace
        </Button>
      </div>
    </Card>
  );
}

/** Settings for the open workspace: its details, who has access, the other workspaces, and deleting it. */
export function WorkspaceSettings() {
  const workspaces = useWorkspaces((s) => s.workspaces);
  const unavailable = useWorkspaces((s) => s.unavailable);
  const refresh = useWorkspaces((s) => s.refresh);
  const current = useCurrentWorkspace();
  const viewer = useOrgViewer();
  const { confirm, confirmDialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const mayCreate = viewer?.can_create_workspaces ?? false;

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
          title="You don't have access to a workspace yet."
          description="Sites live in workspaces. Ask an owner or admin of your organisation to give you access to one."
          action={
            mayCreate ? (
              <Button variant="ghost" onClick={() => setCreating(true)}>
                New workspace
              </Button>
            ) : undefined
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
        caption="The workspace open now. Switch workspace from the top of the side panel."
      >
        <Details key={current.id} workspace={current} />
      </Band>
      <Band
        heading="Access"
        caption="People and teams with a role here have it on every site in the workspace. A site can give more roles of its own, from its panel."
      >
        <AccessList
          key={current.id}
          scope="workspace"
          objectId={current.id}
          objectName={current.name}
          canManage={current.can_manage}
          confirm={confirm}
          onChanged={() => void refresh()}
        />
      </Band>
      <Band heading="Your workspaces" caption={mayCreate ? "Every workspace you have access to. You can start one." : "Every workspace you have access to."}>
        <AllWorkspaces onNew={mayCreate ? () => setCreating(true) : null} />
      </Band>
      <Band heading="Delete workspace">
        <DeleteWorkspace workspace={current} confirm={confirm} />
      </Band>
      {confirmDialog}
      {dialog}
    </>
  );
}
