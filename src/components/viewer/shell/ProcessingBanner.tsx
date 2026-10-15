"use client";

import { Alert, Button, Progress } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import type { ProcessingRun } from "@/lib/api/orblodeSvc";
import { failureLines, failureTitle, notRetryableLines, runStatus } from "@/lib/processing/summary";
import { useProcessing } from "@/lib/processing/store";
import { toast } from "@/lib/toast";

const POLL_MS = 5_000;

/**
 * Over the canvas while the survey processes: where each open run has got to, and when a processor failed, the reason and
 * Retry for runs that can run again as they were. While a run is still going it checks every 5s, skipping ticks while the
 * tab is hidden; survey notices refresh it too.
 */
export function ProcessingBanner({ surveyId }: { surveyId: string }) {
  const current = useProcessing((s) => (s.current?.survey_id === surveyId ? s.current : null));
  const loadCurrent = useProcessing((s) => s.loadCurrent);
  const retry = useProcessing((s) => s.retry);
  const [busy, setBusy] = useState(false);
  const [dismissedRuns, setDismissedRuns] = useState<string | null>(null);
  const open = (current?.open ?? 0) > 0;
  const runs = current?.running ?? [];
  const runsKey = runs.map((r) => r.workflow_id).join(",");

  useEffect(() => {
    void loadCurrent(surveyId);
  }, [surveyId, loadCurrent]);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (!document.hidden) void loadCurrent(surveyId);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, surveyId, loadCurrent]);

  if (!current) return null;
  const failed = current.failures.length > 0;
  const showRuns = runs.length > 0 && runsKey !== dismissedRuns;
  if (!failed && !showRuns) return null;
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
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex flex-col items-center gap-2 px-4">
      {failed && (
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
            <span key={current.failures[i].workflow_id} className="block wrap-anywhere">
              {line}
            </span>
          ))}
          {notRetryableLines(current).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
          {open && runs.length === 0 && <span className="block">Other processors are still running.</span>}
        </Alert>
      )}
      {showRuns && <RunningRuns runs={runs} onDismiss={() => setDismissedRuns(runsKey)} />}
    </div>
  );
}

/** Hidden until the set of open runs changes. */
function RunningRuns({ runs, onDismiss }: { runs: ProcessingRun[]; onDismiss: () => void }) {
  return (
    // A group, not a live region: the percents change every few seconds.
    <Alert
      tone="info"
      role="group"
      aria-label="Processing"
      title={runsTitle(runs)}
      onDismiss={onDismiss}
      dismissLabel="Hide processing"
      className="pointer-events-auto w-full max-w-xl"
    >
      <RunProgress runs={runs} />
    </Alert>
  );
}

export const runsTitle = (runs: ProcessingRun[]) => (runs.length === 1 ? `Processing ${runs[0].label}` : `Processing ${runs.length} layers`);

/** One bar per open run; a stage that can't be measured slides. */
export function RunProgress({ runs }: { runs: ProcessingRun[] }) {
  const one = runs.length === 1;
  return runs.map((run) => (
    <Progress
      key={run.workflow_id}
      value={run.percent ?? null}
      size="thin"
      showValue={false}
      label={one ? runStatus(run) : `${run.label}: ${runStatus(run)}`}
      className="mt-2"
    />
  ));
}
