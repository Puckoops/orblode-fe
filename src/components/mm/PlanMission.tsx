"use client";

import { Button, Card, Field, HelperText, Page, PageHeader, SearchSelect, SegmentedControl, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createMission, getRegister, listMissions, type Lease, type Season } from "@/lib/api/mm";
import { seasonOf, SEASON_LABEL } from "@/lib/mm/season";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { MMGate } from "./common";

const today = () => new Date().toISOString().slice(0, 10);

function Content({ leaseId, onBack }: { leaseId: string | null; onBack: () => void }) {
  const router = useRouter();
  const sites = useWorkspaceSites();
  const [leases, setLeases] = useState<Lease[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(leaseId);
  // Through the monsoon the next survey due is the post-monsoon one.
  const [season, setSeason] = useState<Season>(seasonOf(today()) ?? "post");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRegister()
      .then((rows) => setLeases(rows.map((r) => r.lease).filter((l) => l.boundary)))
      .catch(() => setLeases([]));
  }, []);

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name;

  const plan = async () => {
    if (!chosen) {
      setError("Choose the lease to fly.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const baseline = season === "post" ? (await listMissions({ leaseId: chosen })).find((m) => m.season === "pre") : undefined;
      const m = await createMission({ lease_id: chosen, season, baseline_id: baseline?.id });
      router.push(`/mm/missions/${m.id}`);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't draft the mission. Try again."));
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Create"
        title="Plan a mission"
        subtitle="Choose the lease and season; the planner lays out the flight lines and ground control from its boundary."
        back={
          <button type="button" className="hover:underline" onClick={onBack}>
            ← Create
          </button>
        }
      />
      <Card className="sm:max-w-xl">
        {leases === null ? (
          <Skeleton height={160} />
        ) : leases.length === 0 ? (
          <HelperText>
            No lease here has a boundary yet. <Link href="/upload?create=lease">Start a lease project</Link> first: missions are planned from the boundary.
          </HelperText>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label="Lease">
              <SearchSelect
                value={chosen}
                onValueChange={setChosen}
                placeholder="Choose a lease…"
                searchPlaceholder="Find a lease"
                options={leases.map((l) => ({ value: l.id, label: l.name, meta: siteName(l.project_id), keywords: [l.lease_no, l.river].filter(Boolean) }))}
                empty={(query) => `No lease matches “${query}”.`}
              />
            </Field>
            <Field label="Season">
              <SegmentedControl
                aria-label="Season"
                value={season}
                onValueChange={(v) => setSeason(v as Season)}
                options={[
                  { value: "pre", label: SEASON_LABEL.pre },
                  { value: "post", label: SEASON_LABEL.post },
                ]}
              />
            </Field>
            {season === "post" && <HelperText>A post-monsoon mission repeats its lease’s pre-monsoon one, when there is one.</HelperText>}
            <div>
              <Button variant="primary" loading={busy} onClick={() => void plan()}>
                Open the planner
              </Button>
            </div>
          </div>
        )}
        {error && (
          <HelperText tone="error" role="alert" className="mt-4">
            {error}
          </HelperText>
        )}
      </Card>
    </Page>
  );
}

/** Drafts a drone mission over a lease with a boundary, then opens it in the planner. */
export function PlanMission({ leaseId, onBack }: { leaseId: string | null; onBack: () => void }) {
  return (
    <MMGate>
      <Content leaseId={leaseId} onBack={onBack} />
    </MMGate>
  );
}
