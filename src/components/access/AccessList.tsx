"use client";

import { Building03Icon, PencilEdit02Icon, UserAdd01Icon, UserGroupIcon, UserIcon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { Button, HelperText, Icon, IconButton, Skeleton, Table, TBody, Td, Th, THead, Tr, type IconDefinition } from "@puckoops/camelot";
import { useCallback, useEffect, useState } from "react";
import type { ConfirmRequest } from "@/components/common/confirm";
import { useAuthUser } from "@/hooks/useAuth";
import { refusalMessage } from "@/lib/api/client";
import { getAccess, removeAccess, type AccessEntry, type AccessScope, type SubjectType } from "@/lib/api/userSvc";
import { describeRoles, splitAccess } from "@/lib/access/roles";
import { toast } from "@/lib/toast";
import { GrantDialog } from "./GrantDialog";

const SUBJECT_ICON: Record<SubjectType, IconDefinition> = { user: UserIcon, team: UserGroupIcon, organisation: Building03Icon };

function Who({ entry }: { entry: AccessEntry }) {
  const me = useAuthUser();
  const { subject } = entry;
  const secondary = subject.type === "team" ? "Team" : subject.type === "organisation" ? "Everyone in the organisation" : subject.name ? subject.email : undefined;
  return (
    <span className="flex items-start gap-3">
      <Icon icon={SUBJECT_ICON[subject.type]} size={18} className="mt-[2px] shrink-0 text-ink-4" />
      <span className="min-w-0">
        <span className="block">
          {subject.name || subject.email || "Unknown account"}
          {subject.type === "user" && subject.id === me?.id && <span className="text-ink-4"> (you)</span>}
        </span>
        {secondary && <span className="caption block text-ink-4">{secondary}</span>}
      </span>
    </span>
  );
}

function sourceLabel(entry: AccessEntry): string {
  if (entry.source?.type === "workspace") return `Through ${entry.source.name || "its workspace"}`;
  return "Owner or admin of the organisation";
}

/** Who has access to a workspace or a site: the grants made on it, which those who manage it change, and those
 * that reach it from its workspace or the organisation, shown for completeness. */
export function AccessList({
  scope,
  objectId,
  objectName,
  canManage,
  confirm,
  onChanged,
}: {
  scope: AccessScope;
  objectId: string;
  objectName: string;
  canManage: boolean;
  confirm: (request: ConfirmRequest) => void;
  onChanged?: () => void;
}) {
  const me = useAuthUser();
  const [entries, setEntries] = useState<AccessEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<{ editing: AccessEntry | null } | null>(null);

  const load = useCallback(() => {
    getAccess(scope, objectId)
      .then((next) => {
        setFailed(false);
        setEntries(next);
      })
      .catch((err) => {
        console.error("Failed to fetch access:", err);
        setFailed(true);
        setEntries([]);
      });
  }, [scope, objectId]);

  useEffect(load, [load]);

  const saved = (next: AccessEntry[]) => {
    setEntries(next);
    onChanged?.();
  };

  const remove = (entry: AccessEntry) => {
    const self = entry.subject.type === "user" && entry.subject.id === me?.id;
    const who = self ? "your" : `${entry.subject.name || "their"}'s`;
    confirm({
      title: `Take away ${who} access to ${objectName}?`,
      description:
        scope === "workspace"
          ? "Their roles here go, on every site in the workspace. Roles given on a site itself, through a team, or as an owner or admin of the organisation stay."
          : "Their roles on this site go. Roles that reach it from its workspace or the organisation stay.",
      confirmLabel: "Take away",
      onConfirm: async () => {
        try {
          await removeAccess(scope, objectId, entry.subject);
          load();
          onChanged?.();
        } catch (err) {
          toast.error(refusalMessage(err, "Couldn't change access. Try again."));
        }
      },
    });
  };

  if (!entries) return <Skeleton height={96} />;
  const { direct, inherited } = splitAccess(entries);

  return (
    <div className="flex flex-col gap-4">
      {failed && <HelperText tone="error">Access couldn’t load. Reload the page to try again.</HelperText>}
      <Table minWidth={360}>
        <THead>
          <Tr>
            <Th>Who</Th>
            <Th>Roles</Th>
            {canManage && (
              <Th>
                <span className="visually-hidden">Actions</span>
              </Th>
            )}
          </Tr>
        </THead>
        <TBody>
          {direct.map((entry) => (
            <Tr key={`${entry.subject.type}:${entry.subject.id}`}>
              <Td primary>
                <Who entry={entry} />
              </Td>
              <Td>{describeRoles(entry.roles, scope)}</Td>
              {canManage && (
                <Td className="whitespace-nowrap text-right">
                  <IconButton icon={PencilEdit02Icon} aria-label={`Change ${entry.subject.name}'s roles`} variant="bare" size="sm" onClick={() => setDialog({ editing: entry })} />
                  <IconButton icon={UserRemove01Icon} aria-label={`Take away ${entry.subject.name}'s access`} variant="bare" size="sm" onClick={() => remove(entry)} />
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
      {direct.length === 0 && !failed && <HelperText>Nobody has been given access here yet.</HelperText>}
      {canManage && (
        <div>
          <Button variant="ghost" iconStart={UserAdd01Icon} onClick={() => setDialog({ editing: null })}>
            Give access
          </Button>
        </div>
      )}

      {inherited.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="small font-medium text-ink-2">Also here</h4>
          <Table minWidth={360}>
            <THead>
              <Tr>
                <Th>Who</Th>
                <Th>Roles</Th>
                <Th>From</Th>
              </Tr>
            </THead>
            <TBody>
              {inherited.map((entry) => (
                <Tr key={`${entry.source?.type}:${entry.subject.type}:${entry.subject.id}`}>
                  <Td primary>
                    <Who entry={entry} />
                  </Td>
                  <Td>{describeRoles(entry.roles, scope)}</Td>
                  <Td className="caption text-ink-4">{sourceLabel(entry)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {dialog && (
        <GrantDialog
          onClose={() => setDialog(null)}
          scope={scope}
          objectId={objectId}
          objectName={objectName}
          granted={entries}
          editing={dialog.editing}
          onSaved={saved}
        />
      )}
    </div>
  );
}
