"use client";

// Fetches the per-point GCP verification report (FR-17). The manifest's
// gcp_verification VectorLayer carries the headline verdict in its `properties`,
// so the panel renders the summary with no network at all; this hook exists only
// for the expanded detail — the list of which marks failed and which the surface
// never covered.
//
// `enabled` gates the fetch on the user actually opening that detail, so a
// survey with hundreds of control points does not pull the document on every
// panel render. Manifest urls are already proxied onto /gcs at load, so unlike
// the profile hook this one does not re-proxy.
//
// Mirrors useProfileSeries' structure: one in-flight request per url, aborted on
// unmount or url change, and `loading` derived during render so the effect never
// setStates synchronously in its body.

import { useEffect, useState } from "react";

import { parseMarks, type GcpMark } from "@/lib/viewer/gcpVerify";

export interface GcpMarksState {
  marks: GcpMark[] | null;
  loading: boolean;
  error: string | null;
}

interface Resolved {
  url: string | null;
  marks: GcpMark[] | null;
  error: string | null;
}

const NOTHING: Resolved = { url: null, marks: null, error: null };

export function useGcpMarks(reportUrl?: string | null, enabled = true): GcpMarksState {
  const [resolved, setResolved] = useState<Resolved>(NOTHING);
  // A disabled hook must look exactly like one with no url, or `loading` would
  // read true forever while nothing is being fetched.
  const url = enabled ? (reportUrl ?? null) : null;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`report fetch failed (${res.status})`);
        const marks = parseMarks(await res.json());
        if (controller.signal.aborted) return;
        setResolved(
          marks
            ? { url, marks, error: null }
            : { url, marks: null, error: "Report data is unreadable" }
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        setResolved({
          url,
          marks: null,
          error: err instanceof Error ? err.message : "Report fetch failed",
        });
      }
    })();

    return () => controller.abort();
  }, [url]);

  const settled = resolved.url === url;
  return {
    marks: settled ? resolved.marks : null,
    loading: !!url && !settled,
    error: settled ? resolved.error : null,
  };
}
