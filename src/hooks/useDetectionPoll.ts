"use client";

import { useEffect, useRef, useState } from "react";
import { DETECTION_POLL_INTERVAL_MS, DETECTION_POLL_WINDOW_MS } from "@/lib/upload/review";

/**
 * Calls `load` every 1.5 s while it answers true (some file is still being read), for at most 90 s
 * from each new `round`; a null round stops. A round number must never be reused: one that already
 * settled reads as settled again. `timedOut` says the last round gave up waiting.
 */
export function useDetectionPoll(load: () => Promise<boolean>, round: number | null) {
  const loadRef = useRef(load);
  const [settled, setSettled] = useState<{ round: number; timedOut: boolean } | null>(null);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (round === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      let more = true;
      try {
        more = await loadRef.current();
      } catch {
        // the next tick asks again
      }
      if (cancelled) return;
      if (!more) setSettled({ round, timedOut: false });
      else if (Date.now() - started >= DETECTION_POLL_WINDOW_MS) setSettled({ round, timedOut: true });
      else timer = setTimeout(tick, DETECTION_POLL_INTERVAL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [round]);

  const done = round !== null && settled?.round === round;
  return { polling: round !== null && !done, timedOut: done && settled.timedOut };
}
