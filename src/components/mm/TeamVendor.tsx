"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button, Card, Field, HelperText, Input, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { CAMERAS, listDrones, listVendors, saveVendor, type Drone, type Vendor } from "@/lib/api/mm";
import { toast } from "@/lib/toast";
import { useCurrentWorkspace } from "@/lib/workspaces/store";
import { DroneDialog } from "./DroneDialog";

/** A team as a drone vendor of the open minor-minerals workspace: missions are issued to it, its members see them and
 * upload the flights, and its drones are checked on the flight date. */
export function TeamVendor({ team }: { team: { id: string; name: string } }) {
  const workspace = useCurrentWorkspace();
  const mayEdit = workspace?.can_manage ?? false;
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [company, setCompany] = useState(team.name);
  const [contact, setContact] = useState("");
  const [existing, setExisting] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Drone | "new" | null>(null);
  const vendor = vendors?.find((v) => v.team_id === team.id);

  const load = useCallback(
    () =>
      listVendors()
        .then((list) => {
          setVendors(list);
          const mine = list.find((v) => v.team_id === team.id);
          return mine ? listDrones(mine.id).then(setDrones) : setDrones([]);
        })
        .catch(() => setVendors([])),
    [team.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const link = async () => {
    const other = vendors?.find((v) => v.id === existing);
    if (!other && !company.trim()) {
      toast.error("Name the company.");
      return;
    }
    setBusy(true);
    try {
      const saved = other
        ? await saveVendor({ name: other.name, contact: other.contact, user_ids: other.user_ids, team_id: team.id }, other.id)
        : await saveVendor({ name: company.trim(), contact: contact.trim(), user_ids: [], team_id: team.id });
      toast.success(`${team.name} flies for ${saved.name}.`);
      await load();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't make the team a vendor."));
    } finally {
      setBusy(false);
    }
  };

  if (vendors === null) return <Skeleton height={96} />;

  if (!vendor) {
    const unlinked = vendors.filter((v) => !v.team_id);
    if (!mayEdit)
      return <HelperText>Not a drone vendor of {workspace?.name ?? "this workspace"}. Its admins can make it one.</HelperText>;
    return (
      <Card>
        <div className="flex flex-col gap-4 sm:max-w-md">
          <HelperText>
            Missions in {workspace?.name ?? "this workspace"} can be issued to the team; its members see them and upload the flights. Give the team the
            Field vendor role in <Link href="/settings?tab=workspace">Settings → Workspace</Link> so they can.
          </HelperText>
          {unlinked.length > 0 && (
            <Field label="Company" hint="A vendor kept before teams, or a new one.">
              <Select
                value={existing}
                onValueChange={setExisting}
                allLabel="A new company"
                options={unlinked.map((v) => ({ value: v.id, label: v.name }))}
              />
            </Field>
          )}
          {!existing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <Input value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} />
              </Field>
              <Field label="Contact">
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name, phone" />
              </Field>
            </div>
          )}
          <div>
            <Button variant="primary" loading={busy} onClick={() => void link()}>
              Make it a drone vendor
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="small text-ink-2">
        Flies for <span className="font-medium text-ink-1">{vendor.name}</span>
        {vendor.contact ? ` · ${vendor.contact}` : ""} in {workspace?.name ?? "this workspace"}.
      </p>
      <Table
        minWidth={560}
        isEmpty={drones.length === 0}
        empty="No drones yet: missions need one, with its insurance and the pilot's RPC valid on the flight date."
      >
        <THead>
          <Tr>
            <Th>Drone</Th>
            <Th>UIN</Th>
            <Th>Pilot</Th>
            <Th>Insurance to</Th>
            <Th>RPC to</Th>
          </Tr>
        </THead>
        <TBody>
          {drones.map((d) => (
            <Tr key={d.id} onClick={mayEdit ? () => setEditing(d) : undefined} className={mayEdit ? "cursor-pointer" : undefined}>
              <Td primary>
                {d.model}
                <span className="caption block text-ink-4">{CAMERAS[d.camera] ?? d.camera}</span>
              </Td>
              <Td>{d.uin}</Td>
              <Td>{d.pilot || "–"}</Td>
              <Td>{d.insurance_valid_to || "–"}</Td>
              <Td>{d.rpc_valid_to || "–"}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {mayEdit && (
        <div>
          <Button size="sm" variant="ghost" iconStart={Add01Icon} onClick={() => setEditing("new")}>
            Add a drone
          </Button>
        </div>
      )}
      {editing && (
        <DroneDialog drone={editing === "new" ? null : editing} vendors={[vendor]} onClose={() => setEditing(null)} onSaved={() => void load()} />
      )}
    </div>
  );
}
