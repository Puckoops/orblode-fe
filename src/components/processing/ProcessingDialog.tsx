"use client";

import { Alert, Button, Dialog, DescriptionList, HelperText } from "@puckoops/camelot";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RunProgress, runsTitle } from "@/components/viewer/shell/ProcessingBanner";
import { refusalMessage } from "@/lib/api/client";
import { getFlightProcessing, processFlight, surveyFlight, type ControlMethod, type FlightProcessing } from "@/lib/api/mm";
import { getSurveyProcessing, retryProcessing, type SurveyProcessing } from "@/lib/api/orblodeSvc";
import { failureLines, failureTitle, notRetryableLines } from "@/lib/processing/summary";
import { toast } from "@/lib/toast";

const POLL_MS = 5_000;

export const CONTROL_METHOD_LABELS: Record<ControlMethod, string> = {
  targets: "GCP targets, marked by hand",
  smart: "Smart GCPs, marked by hand",
  coded: "Coded targets, found automatically",
  rtk: "RTK/PPK drone, every point a check",
};

const flightStatus: Record<FlightProcessing["status"], string> = {
  uploading: "Waiting for its photos",
  queued: "Waiting for the photogrammetry machine",
  running: "Photogrammetry is running",
  layers: "Making the viewer's layers",
  done: "Processed",
  failed: "Photogrammetry failed",
};

async function readProcessing(surveyId: string, missionId?: string) {
  const processing = await getSurveyProcessing(surveyId);
  const flight = missionId ? await getFlightProcessing(missionId, surveyId).catch(() => null) : await surveyFlight(surveyId, processing.project_id).catch(() => null);
  return { processing, flight };
}

/** Whether the survey can't open in the viewer: something is still running, or its photos failed to process. */
export const keepsViewerShut = (processing: SurveyProcessing | null, flight: FlightProcessing | null) =>
  (processing?.open ?? 0) > 0 || flight?.status === "failed";

/**
 * Where a survey's processing has got to, opened from wherever the survey shows as processing: each run's stage, what
 * failed and Retry, and for a flight uploaded as raw photos, its photogrammetry. Pass missionId when it is known; else
 * the flight is found through the survey's season tag.
 */
export function ProcessingDialog({ surveyId, missionId, open, onClose }: { surveyId: string; missionId?: string; open: boolean; onClose: () => void }) {
  const [processing, setProcessing] = useState<SurveyProcessing | null>(null);
  const [flight, setFlight] = useState<FlightProcessing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      readProcessing(surveyId, missionId).then(
        (r) => {
          setProcessing(r.processing);
          setFlight(r.flight);
          setError(null);
        },
        (err) => setError(refusalMessage(err, "Couldn't read the survey's processing."))
      ),
    [surveyId, missionId]
  );

  const running = (processing?.open ?? 0) > 0;
  useEffect(() => {
    if (!open) return;
    let live = true;
    readProcessing(surveyId, missionId).then(
      (r) => {
        if (!live) return;
        setProcessing(r.processing);
        setFlight(r.flight);
        setError(null);
      },
      (err) => live && setError(refusalMessage(err, "Couldn't read the survey's processing."))
    );
    return () => {
      live = false;
    };
  }, [open, surveyId, missionId]);
  useEffect(() => {
    if (!open || !running) return;
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, running, load]);

  const flightFailed = flight?.status === "failed";
  const failures = (processing?.failures ?? []).filter((f) => f.processor_type !== "photogrammetry");
  const others = processing ? { ...processing, failures } : null;
  const retryable = failures.filter((f) => f.retryable);

  const retry = async () => {
    setBusy(true);
    try {
      if (flightFailed && flight) {
        const o = flight.options;
        await processFlight(flight.mission_id, surveyId, { preset: o.preset || "standard", layers: { dsm: o.dsm, orthophoto: o.orthophoto, pointcloud: o.pointcloud } });
      }
      const results = await Promise.allSettled(retryable.map((f) => retryProcessing(surveyId, f.workflow_id)));
      if (results.some((r) => r.status === "rejected")) toast.error("Some processors couldn't be started again. Try again in a moment.");
      else toast.success("Processing again");
      await load();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't start processing again."));
    } finally {
      setBusy(false);
    }
  };

  const runs = processing?.running ?? [];
  const title = running ? (runs.length ? runsTitle(runs) : "Processing") : flightFailed ? "Photogrammetry failed" : failures.length && others ? failureTitle(others) : "Processing finished";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={running ? "This survey opens in the viewer once every run has finished." : undefined}
      width={560}
      footer={
        <>
          {(flightFailed || retryable.length > 0) && !running && (
            <Button variant="ghost" loading={busy} onClick={() => void retry()}>
              Retry
            </Button>
          )}
          {processing && !keepsViewerShut(processing, flight) && (
            <Button asChild variant="ghost">
              <Link href={`/viewer/${surveyId}`}>Open in viewer</Link>
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
        {flight && <FlightSummary flight={flight} />}
        {runs.length > 0 && (
          <div role="group" aria-label="Processing">
            <RunProgress runs={runs} />
          </div>
        )}
        {flightFailed && (
          <Alert tone="critical" title="The photos couldn't be made into layers">
            <span className="block wrap-anywhere">{flight.error || "Photogrammetry stopped without a reason."}</span>
            <span className="block">Retry runs it again with the same photos and ground control. Fix the marks first if they were wrong.</span>
          </Alert>
        )}
        {others && failures.length > 0 && (
          <Alert tone="critical" title={failureTitle(others)}>
            {failureLines(others).map((line, i) => (
              <span key={failures[i].workflow_id} className="block wrap-anywhere">
                {line}
              </span>
            ))}
            {notRetryableLines(others).map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </Alert>
        )}
        {processing && !running && !flightFailed && failures.length === 0 && <p className="small text-ink-3">Nothing is processing.</p>}
      </div>
    </Dialog>
  );
}

function FlightSummary({ flight }: { flight: FlightProcessing }) {
  const items = [
    { label: "Photos", value: `${flight.photos.count}${flight.photos_used ? ` · ${flight.photos_used} placed` : ""}` },
    { label: "Ground control", value: CONTROL_METHOD_LABELS[flight.method] ?? flight.method },
    { label: "Status", value: flightStatus[flight.status] ?? flight.status },
  ];
  if (flight.gsd_cm) items.push({ label: "Ground sample distance", value: `${flight.gsd_cm.toFixed(1)} cm` });
  if (flight.gcp_rmse_m !== undefined) items.push({ label: "GCP height error (RMSE)", value: `${(flight.gcp_rmse_m * 100).toFixed(1)} cm` });
  if (flight.gcps_used?.length) items.push({ label: "GCPs used", value: flight.gcps_used.join(", ") });
  return (
    <div className="flex flex-col gap-2">
      <DescriptionList items={items} />
      {flight.warnings?.map((w) => (
        <HelperText key={w} tone="hint">
          {w}
        </HelperText>
      ))}
    </div>
  );
}
