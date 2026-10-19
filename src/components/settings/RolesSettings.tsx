"use client";

import { Add01Icon, Copy01Icon, Delete02Icon, PencilEdit02Icon, Shield01Icon } from "@hugeicons/core-free-icons";
import {
  Band,
  Button,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  Field,
  HelperText,
  IconButton,
  Input,
  Skeleton,
  Table,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/common/confirm";
import { refusalMessage } from "@/lib/api/client";
import { createCustomRole, deleteCustomRole, updateCustomRole, type CustomRole, type RoleCatalogue } from "@/lib/api/userSvc";
import { PROJECT_ROLES, ROLES } from "@/lib/access/roles";
import { permissionLabels, useCustomRoles } from "@/lib/access/customRoles";
import { useOrgViewer } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

const ALWAYS = "can_view_published";

type Draft = Omit<CustomRole, "id"> & { id?: string };

function RoleEditor({ draft, catalogue, onClose, onSaved }: { draft: Draft; catalogue: RoleCatalogue; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [permissions, setPermissions] = useState<string[]>(Array.from(new Set([ALWAYS, ...draft.permissions])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (key: string, on: boolean) => setPermissions((held) => (on ? [...held, key] : held.filter((p) => p !== key)));

  const save = async () => {
    if (!name.trim()) {
      setError("Give the role a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim(), permissions, template: draft.template };
      if (draft.id) await updateCustomRole(draft.id, body);
      else await createCustomRole(body);
      toast.success(draft.id ? "Role saved." : "Role created.");
      onSaved();
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the role. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !busy && onClose()}
      title={draft.id ? `Edit ${draft.name}` : "New role"}
      description="Tick what the role allows. It is given on a workspace or a site, like a built-in role, and changes there for everyone who holds it."
      width={600}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {draft.id ? "Save" : "Create role"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tahasildar" maxLength={80} />
        </Field>
        <Field label="What it is for">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Vets replenishment reports for the Tahasil." />
        </Field>
        {catalogue.groups.map((group) => (
          <fieldset key={group.key} className="flex flex-col gap-3">
            <legend className="small mb-2 font-medium text-ink-1">{group.label}</legend>
            {group.permissions.map((p) => (
              <div key={p.key} className="flex flex-col gap-1">
                <Checkbox
                  label={p.label}
                  checked={permissions.includes(p.key)}
                  disabled={busy || p.locked || p.key === ALWAYS}
                  onCheckedChange={(on) => toggle(p.key, on)}
                />
                <span className="caption pl-7 text-ink-4">{p.description}</span>
              </div>
            ))}
          </fieldset>
        ))}
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}

/** The organisation's roles: the built-in ones, fixed, and the ones it made by choosing permissions. Owners and
 * admins make and change them; anyone who manages access gives them out. */
export function RolesSettings() {
  const viewer = useOrgViewer();
  const roles = useCustomRoles((s) => s.roles);
  const catalogue = useCustomRoles((s) => s.catalogue);
  const load = useCustomRoles((s) => s.load);
  const refresh = useCustomRoles((s) => s.refresh);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const canEdit = viewer?.role === "owner" || viewer?.role === "admin";

  useEffect(() => {
    void load();
  }, [load]);

  const remove = (role: CustomRole) =>
    confirm({
      title: `Delete ${role.name}?`,
      description: "Everyone who holds it, on every workspace and site, loses what it allowed. Roles they hold besides stay.",
      confirmLabel: "Delete role",
      onConfirm: async () => {
        try {
          await deleteCustomRole(role.id);
          toast.success("Role deleted.");
          await refresh();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't delete the role. Try again."));
        }
      },
    });

  return (
    <>
      <Band
        first
        heading="Custom roles"
        caption="Roles your organisation makes from the permissions below, such as an official who vets reports or a vendor who flies missions."
        actions={
          canEdit && catalogue ? (
            <Button variant="ghost" iconStart={Add01Icon} onClick={() => setDraft({ name: "", description: "", permissions: [] })}>
              New role
            </Button>
          ) : undefined
        }
      >
        {roles === null || catalogue === null ? (
          <Skeleton height={120} />
        ) : roles.length === 0 ? (
          <EmptyState icon={Shield01Icon} title="No custom roles yet." description={canEdit ? "Start from a template or from scratch." : "Owners and admins make them."} framed />
        ) : (
          <Table minWidth={520}>
            <THead>
              <Tr>
                <Th>Role</Th>
                <Th>Allows</Th>
                {canEdit && (
                  <Th>
                    <span className="visually-hidden">Actions</span>
                  </Th>
                )}
              </Tr>
            </THead>
            <TBody>
              {roles.map((role) => (
                <Tr key={role.id}>
                  <Td primary>
                    <span className="block">{role.name}</span>
                    {role.description && <span className="caption block text-ink-4">{role.description}</span>}
                  </Td>
                  <Td className="caption">{permissionLabels(role, catalogue).join(" · ")}</Td>
                  {canEdit && (
                    <Td className="whitespace-nowrap text-right">
                      <IconButton icon={PencilEdit02Icon} aria-label={`Edit ${role.name}`} variant="bare" size="sm" onClick={() => setDraft(role)} />
                      <IconButton
                        icon={Copy01Icon}
                        aria-label={`Duplicate ${role.name}`}
                        variant="bare"
                        size="sm"
                        onClick={() => setDraft({ name: `${role.name} (copy)`, description: role.description, permissions: role.permissions })}
                      />
                      <IconButton icon={Delete02Icon} aria-label={`Delete ${role.name}`} variant="bare" size="sm" onClick={() => remove(role)} />
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Band>

      {canEdit && catalogue && catalogue.templates.length > 0 && (
        <Band heading="Start from a template" caption="Each fills in a new role you can still change before saving.">
          <div className="flex flex-wrap gap-3">
            {catalogue.templates.map((t) => (
              <Button
                key={t.key}
                variant="ghost"
                iconStart={Add01Icon}
                onClick={() => setDraft({ name: t.name, description: t.description, permissions: t.permissions, template: t.key })}
              >
                {t.name}
              </Button>
            ))}
          </div>
        </Band>
      )}

      <Band heading="Built-in roles" caption="Fixed. Give them on a workspace or a site from its Access list.">
        <Table minWidth={520} density="compact">
          <THead>
            <Tr>
              <Th>Role</Th>
              <Th>Allows</Th>
            </Tr>
          </THead>
          <TBody>
            {PROJECT_ROLES.map((key) => (
              <Tr key={key}>
                <Td primary>
                  <span className="flex items-center gap-2">
                    {ROLES[key].label}
                    <Chip tone="neutral" glyph="square">
                      Built in
                    </Chip>
                  </span>
                </Td>
                <Td className="caption">{ROLES[key].description}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Band>

      {draft && catalogue && <RoleEditor draft={draft} catalogue={catalogue} onClose={() => setDraft(null)} onSaved={() => void refresh()} />}
      {confirmDialog}
    </>
  );
}
