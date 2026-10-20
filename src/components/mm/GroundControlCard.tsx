"use client";

import { Button, HelperText, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { listGnssJobs, missionGroundControl, type GnssJob, type Mission } from "@/lib/api/mm";
import { gnssTargets } from "@/lib/mm/gnssMatch";
import { toast } from "@/lib/toast";
import { GNSS_STATUS, StatusChip } from "./common";

/** A mission's DGPS job in its hand-off: the reference station, the points that need logs and how far it has got. An
 * issued mission without one can have it made once the workspace has a reference station. */
export function GroundControlCard({ mission, canPlan, onChange }: { mission: Mission; canPlan: boolean; onChange: (m: Mission) => void }) {
  const [job, setJob] = useState<GnssJob | null | undefined>(mission.gnss_job_id ? undefined : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mission.gnss_job_id) return;
    let live = true;
    listGnssJobs(mission.project_id)
      .then((jobs) => live && setJob(jobs.find((j) => j.id === mission.gnss_job_id) ?? null))
      .catch(() => live && setJob(null));
    return () => {
      live = false;
    };
  }, [mission.gnss_job_id, mission.project_id]);

  const make = async () => {
    setBusy(true);
    try {
      onChange(await missionGroundControl(mission.id));
      toast.success("DGPS job made.");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't make the DGPS job."));
    } finally {
      setBusy(false);
    }
  };

  if (mission.status === "draft" || mission.status === "returned")
    return <HelperText>Made when the mission is issued, from its ground control points and the workspace’s reference station.</HelperText>;
  if (job === undefined) return <Skeleton height={72} />;
  if (job === null)
    return (
      <div className="flex flex-col items-start gap-2">
        <HelperText>
          No DGPS job yet. It needs the workspace’s reference station, set in <Link href="/settings?tab=workspace">Settings → Workspace</Link>.
        </HelperText>
        {canPlan && (
          <Button size="sm" variant="ghost" loading={busy} onClick={() => void make()}>
            Make the DGPS job
          </Button>
        )}
      </div>
    );

  const sessions = [job.reference.files, ...(job.base ? [job.base.files] : []), ...job.rovers.map((r) => r.files)];
  const logged = sessions.filter((files) => files.some((f) => f.uploaded)).length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="small font-medium text-ink-1">{job.code}</span>
        <StatusChip map={GNSS_STATUS} value={job.status} />
      </div>
      <p className="caption text-ink-3">
        Solved against {job.reference.name}. {gnssTargets(job).slice(1).map((t) => t.label.split(" · ")[1]).join(", ")}.
      </p>
      <p className="caption text-ink-4">
        {logged} of {sessions.length} have logs. The vendor adds them with the flight.
      </p>
      <div>
        <Button asChild size="sm" variant="quiet">
          <Link href={`/mm/dgps?job=${encodeURIComponent(job.id)}`}>Open in DGPS</Link>
        </Button>
      </div>
    </div>
  );
}
