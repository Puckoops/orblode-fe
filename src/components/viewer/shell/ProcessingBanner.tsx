"use client";

import { Alert, Button } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { failureLines, failureTitle } from "@/lib/processing/summary";
import { useProcessing } from "@/lib/processing/store";
import { toast } from "@/lib/toast";

const POLL_MS = 30_000;

/**
 * Over the canvas when a processor failed on this survey: the reason, and Retry for runs that kept
 * their request. While a run is still going it checks every 30s; survey notices refresh it too.
 */
export function ProcessingBanner({ surveyId }: { surveyId: string }) {
  const current = useProcessing((s) => (s.current?.survey_id === surveyId ? s.current : null));
  const loadCurrent = useProcessing((s) => s.loadCurrent);
  const retry = useProcessing((s) => s.retry);
  const [busy, setBusy] = useState(false);
  const running = (current?.open ?? 0) > 0;

  useEffect(() => {
    void loadCurrent(surveyId);
  }, [surveyId, loadCurrent]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void loadCurrent(surveyId), POLL_MS);
    return () => clearInterval(timer);
  }, [running, surveyId, loadCurrent]);

  if (!current || current.failures.length === 0) return null;
  const retryable = current.failures.filter((f) => f.retryable);

  const runAgain = async () => {
    setBusy(true);
    try {
      const started = await retry(surveyId, current.failures);
      if (started === retryable.length) toast.success(started === 1 ? "Processing again" : `Processing ${started} again`);
      else toast.error("Some processors couldn't be started again. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
      <Alert
        tone="critical"
        title={failureTitle(current)}
        className="pointer-events-auto w-full max-w-xl"
        action={
          retryable.length > 0 ? (
            <Button variant="ghost" size="sm" loading={busy} onClick={() => void runAgain()}>
              Retry
            </Button>
          ) : undefined
        }
      >
        {failureLines(current).map((line, i) => (
          <span key={current.failures[i].workflow_id} className="block">
            {line}
          </span>
        ))}
        {retryable.length < current.failures.length && (
          <span className="block">{retryable.length === 0 ? "Upload the file again to process it." : "The others need their files uploaded again."}</span>
        )}
        {running && <span className="block">Other processors are still running.</span>}
      </Alert>
    </div>
  );
}
