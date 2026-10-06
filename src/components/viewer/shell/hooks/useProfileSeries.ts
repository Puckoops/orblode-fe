"use client";

// Fetches + parses the elevation series behind a cross-section measurement
// (FR-09). The measurement's §7.1 result doc carries only the summary metrics
// (profile_point_count / profile_length_m); the samples themselves live in the
// `profile` artifact whose URL asset-svc surfaces as `artifacts.profile_url`.
//
// The URL points at the GCS bucket, which has no CORS policy — the same reason
// every manifest URL is rewritten at load. Manifest URLs go through
// filesUrlsIn centrally, but a RESULT doc never passes through that path, so
// the rewrite happens here instead, immediately before the fetch.
//
// One in-flight request per URL, aborted on unmount or URL change: selecting
// through a list of cross-sections must not leave earlier responses racing to
// overwrite the newest one.
//
// State holds the url it was RESOLVED FOR, and `loading` is derived during
// render by comparing that to the requested url. The effect therefore only ever
// setStates from its async callback — never synchronously in its body, which
// would cascade an extra render on every selection change
// (https://react.dev/learn/you-might-not-need-an-effect).

import { useEffect, useState } from "react";

import { filesUrlsIn } from "@/lib/files";
import { parseProfileSeries, type ProfileSeries } from "@/lib/viewer/profile";

export interface ProfileState {
  series: ProfileSeries | null;
  loading: boolean;
  /** Set when the artifact exists but could not be read — distinct from "this
   * measurement simply has no profile yet", which is the all-null state. */
  error: string | null;
}

/** What the last settled fetch produced, tagged with the url it answers for. */
interface Resolved {
  url: string | null;
  series: ProfileSeries | null;
  error: string | null;
}

const NOTHING: Resolved = { url: null, series: null, error: null };

export function useProfileSeries(profileUrl?: string | null): ProfileState {
  const [resolved, setResolved] = useState<Resolved>(NOTHING);
  const url = profileUrl ?? null;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(filesUrlsIn(url), { signal: controller.signal });
        if (!res.ok) throw new Error(`profile fetch failed (${res.status})`);
        const series = parseProfileSeries(await res.json());
        if (controller.signal.aborted) return;
        setResolved(
          series
            ? { url, series, error: null }
            : { url, series: null, error: "Profile data is unreadable" }
        );
      } catch (err) {
        // An abort is the expected outcome of switching selection — it must not
        // surface as an error on a component that has already moved on.
        if (controller.signal.aborted) return;
        setResolved({
          url,
          series: null,
          error: err instanceof Error ? err.message : "Profile fetch failed",
        });
      }
    })();

    return () => controller.abort();
  }, [url]);

  // Derived, not stored: the fetch is settled only when what we hold answers for
  // the url being asked about. Anything else is still in flight (or nothing was
  // requested at all, which is the idle triple).
  const settled = resolved.url === url;
  return {
    series: settled ? resolved.series : null,
    loading: !!url && !settled,
    error: settled ? resolved.error : null,
  };
}
