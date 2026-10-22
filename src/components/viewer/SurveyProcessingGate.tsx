"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { HourglassIcon } from "@hugeicons/core-free-icons";
import { Button, EmptyState } from "@puckoops/camelot";

import { Loader } from "@/components/brand/Loader";
import { ProcessingDialog } from "@/components/processing/ProcessingDialog";
import { RunProgress } from "@/components/viewer/shell/ProcessingBanner";
import { getPhotoFlight, type FlightProcessing } from "@/lib/api/orblodeSvc";
import { failureLines } from "@/lib/processing/summary";
import { useProcessing } from "@/lib/processing/store";
import { sitesHref } from "@/lib/viewer/surveyAccess";

const POLL_MS = 5_000;

/**
 * A survey doesn't open in the viewer while it processes: this stands in front of it with where each run has got to, and
 * lets the viewer in once the last run ends. Once in, a run started from the viewer keeps it open. A survey whose
 * processing can't be read opens, so the viewer can say why it can't be shown. A survey made from raw photos whose
 * photogrammetry failed has no layers to show, so it stays shut with the reason and Retry.
 */
export function SurveyProcessingGate({ surveyId, children }: { surveyId: string; children: ReactNode }) {
  const current = useProcessing((s) => (s.current?.survey_id === surveyId ? s.current : null));
  const loadCurrent = useProcessing((s) => s.loadCurrent);
  const [checked, setChecked] = useState(false);
  const [opened, setOpened] = useState(false);
  const [details, setDetails] = useState(false);
  const [flight, setFlight] = useState<FlightProcessing | null | undefined>(undefined);
  const [flightTick, setFlightTick] = useState(0);
  const photosFailed = !!current?.failures.some((f) => f.processor_type === "photogrammetry");
  const flightKnown = !photosFailed || flight !== undefined;
  const flightFailed = photosFailed && flight?.status === "failed";
  const processing = checked && !opened && ((current?.open ?? 0) > 0 || flightFailed);

  useEffect(() => {
    let cancelled = false;
    void loadCurrent(surveyId).finally(() => {
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [surveyId, loadCurrent]);

  useEffect(() => {
    if (!checked || !photosFailed) return;
    let live = true;
    getPhotoFlight(surveyId).then(
      (f) => live && setFlight(f),
      () => live && setFlight(null)
    );
    return () => {
      live = false;
    };
  }, [checked, photosFailed, surveyId, flightTick]);

  useEffect(() => {
    if (!processing || flightFailed) return;
    const timer = setInterval(() => {
      if (!document.hidden) void loadCurrent(surveyId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [processing, flightFailed, surveyId, loadCurrent]);

  if (checked && flightKnown && !opened && !processing) setOpened(true);

  if (!checked || (!opened && !flightKnown)) return <Loader variant="fill" label="Loading the viewer" />;
  if (!processing || !current) return children;

  const closeDetails = () => {
    setDetails(false);
    void loadCurrent(surveyId);
    setFlightTick((t) => t + 1);
  };

  const failures = failureLines(current);
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-canvas px-6 py-10">
      <div className="flex w-full max-w-md flex-col gap-4">
        <EmptyState
          framed
          icon={HourglassIcon}
          title={flightFailed ? "This survey's photos couldn't be processed." : "This survey is still processing."}
          description={flightFailed ? flight?.error || "Photogrammetry stopped without a reason." : "It opens here by itself as soon as processing finishes."}
          action={
            <span className="flex flex-wrap justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDetails(true)}>
                {flightFailed ? "Details and Retry" : "Details"}
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={sitesHref(current.project_id || null)}>See the site&apos;s surveys</Link>
              </Button>
            </span>
          }
        />
        {(current.running?.length ?? 0) > 0 && (
          <div role="group" aria-label="Processing" className="rounded-md border border-hairline bg-surface px-4 pt-2 pb-4">
            <RunProgress runs={current.running!} />
          </div>
        )}
        {failures.length > 0 && !flightFailed && (
          <p className="caption text-ink-3">
            Already failed: {failures.join(" · ")}
          </p>
        )}
      </div>
      {details && <ProcessingDialog surveyId={surveyId} open onClose={closeDetails} />}
    </div>
  );
}
