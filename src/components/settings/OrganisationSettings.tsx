"use client";

import { Band, Card, DescriptionList, HelperText, Skeleton, Switch } from "@puckoops/camelot";
import { useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { updateMemberPrivileges, type MemberPrivileges } from "@/lib/api/userSvc";
import { ORG_ROLES, orgRoleLabel } from "@/lib/access/roles";
import { useOrganisation } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

/** The organisation, the person's role in it, and what members may do on their own. */
export function OrganisationSettings() {
  const organisation = useOrganisation((s) => s.organisation);
  const refresh = useOrganisation((s) => s.refresh);
  const [saving, setSaving] = useState<keyof MemberPrivileges | null>(null);

  if (!organisation) {
    return (
      <Band first heading="Organisation">
        <Skeleton height={148} />
      </Band>
    );
  }
  const { viewer, member_privileges: privileges } = organisation;

  const change = async (key: keyof MemberPrivileges, on: boolean) => {
    setSaving(key);
    try {
      await updateMemberPrivileges({ [key]: on });
      await refresh();
      toast.success("Saved.");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't save. Try again."));
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <Band first eyebrow="Organisation" heading={organisation.name}>
        <Card>
          <DescriptionList
            items={[
              { label: "Your role", value: orgRoleLabel(viewer.role) },
              { label: "What it lets you do", value: ORG_ROLES.find((r) => r.value === viewer.role)?.description ?? "" },
            ]}
          />
        </Card>
      </Band>
      <Band heading="Member privileges" caption="What members who aren't owners or admins may do on their own. Owners and admins can always.">
        <Card>
          <div className="flex flex-col gap-5">
            <Switch
              label="Create workspaces"
              description="The member who creates one becomes its admin."
              labelPosition="start"
              checked={privileges.create_workspaces}
              disabled={!viewer.can_manage_people || saving !== null}
              onCheckedChange={(on) => void change("create_workspaces", on)}
            />
            <Switch
              label="Create teams"
              description="The member who creates one becomes its maintainer."
              labelPosition="start"
              checked={privileges.create_teams}
              disabled={!viewer.can_manage_people || saving !== null}
              onCheckedChange={(on) => void change("create_teams", on)}
            />
            {!viewer.can_manage_people && <HelperText>Only owners and admins change these.</HelperText>}
          </div>
        </Card>
      </Band>
    </>
  );
}
