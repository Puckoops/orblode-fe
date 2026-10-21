"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Dialog, Field, HelperText, Page, PageHeader, SearchSelect, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createMission, listLeases, listMissions, myMissions, type Lease, type Mission, type MissionStatus, type Season } from "@/lib/api/mm";
import { ha, WORKFLOWS } from "@/lib/mm/format";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { MISSION_STATUS, MMGate, StatusChip } from "./common";

function NewMission({ leases, onClose }: { leases: Lease[]; onClose: () => void }) {
  const router = useRouter();
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season>("pre");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = leases.filter((l) => l.boundary);

  const create = async () => {
    if (!leaseId) {
      setError("Choose the lease to fly.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const m = await createMission({ lease_id: leaseId, season });
      router.push(`/mm/missions/${m.id}`);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't draft the mission. Try again."));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="New mission"
      description="The planner lays out flight lines and ground control over the lease boundary; you adjust them, then issue it to a vendor."
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Open the planner
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Lease" hint={ready.length < leases.length ? "Only leases with a boundary can be planned." : undefined}>
          <SearchSelect
            value={leaseId}
            onValueChange={setLeaseId}
            placeholder="Choose a lease"
            searchPlaceholder="Find a lease"
            options={ready.map((l) => ({ value: l.id, label: l.name, meta: l.boundary ? ha(l.boundary.area_m2) : undefined }))}
            empty={(q) => (q ? `No lease matches “${q}”.` : "No lease has a boundary yet.")}
          />
        </Field>
        <Field label="Season">
          <Select
            value={season}
            onValueChange={(v) => setSeason(v as Season)}
            options={[
              { value: "pre", label: "Pre-monsoon (S1)" },
              { value: "post", label: "Post-monsoon (S2)" },
            ]}
          />
        </Field>
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}

function MissionTable({ missions, leases, empty }: { missions: Mission[]; leases: Lease[]; empty: string }) {
  const sites = useWorkspaceSites();
  const leaseName = (id: string) => leases.find((l) => l.id === id)?.name ?? "–";
  return (
    <Table minWidth={760} isEmpty={missions.length === 0} empty={empty}>
      <THead>
        <Tr>
          <Th>Mission</Th>
          <Th>Lease</Th>
          <Th>Project</Th>
          <Th>Season</Th>
          <Th numeric>Area</Th>
          <Th>Window</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {missions.map((m) => (
          <Tr key={m.id}>
            <Td primary>
              <Link href={`/mm/missions/${m.id}`} className="hover:underline">
                {m.code}
              </Link>
              <span className="caption block text-ink-4">{WORKFLOWS[m.workflow]}</span>
            </Td>
            <Td>{leaseName(m.lease_id)}</Td>
            <Td>{sites.find((s) => s.id === m.project_id)?.name ?? "–"}</Td>
            <Td>{m.season === "post" ? "Post-monsoon" : "Pre-monsoon"}</Td>
            <Td numeric>{m.stats.area_ha.toFixed(2)} ha</Td>
            <Td>{m.window || m.flight_from || "–"}</Td>
            <Td>
              <StatusChip map={MISSION_STATUS} value={m.status} />
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function Content() {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [mine, setMine] = useState<Mission[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [status, setStatus] = useState<MissionStatus | "">("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listLeases()
      .then(setLeases)
      .catch(() => setLeases([]));
    myMissions()
      .then(setMine)
      .catch(() => setMine([]));
  }, []);

  useEffect(() => {
    listMissions({ status: status || undefined })
      .then(setMissions)
      .catch((err) => {
        console.error("Failed to fetch missions:", err);
        setMissions([]);
      });
  }, [status]);

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals"
        title="Missions"
        subtitle="Drone survey missions: planned over a lease, issued to a vendor, flown and uploaded."
        actions={
          <Button variant="primary" iconStart={Add01Icon} onClick={() => setCreating(true)}>
            New mission
          </Button>
        }
      />
      {mine.length > 0 && (
        <Band first heading="Issued to your company" caption="Accept, fly and upload these.">
          <MissionTable missions={mine} leases={leases} empty="" />
        </Band>
      )}
      <Band
        first={mine.length === 0}
        heading="All missions"
        actions={
          <Select
            aria-label="Status"
            value={status}
            onValueChange={(v) => {
              setMissions(null);
              setStatus(v as MissionStatus | "");
            }}
            allLabel="Every status"
            options={Object.entries(MISSION_STATUS).map(([value, p]) => ({ value, label: p.label }))}
          />
        }
      >
        {!missions ? <Skeleton height={200} /> : <MissionTable missions={missions} leases={leases} empty="No missions yet." />}
      </Band>
      {creating && <NewMission leases={leases} onClose={() => setCreating(false)} />}
    </Page>
  );
}

export function MissionsScreen() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
