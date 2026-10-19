import type { Analysis } from "../api/mm.ts";

/** Below this share of the lease a study warns that part of it went unmeasured, as orblode-svc does. */
export const FULL_COVERAGE_PCT = 95;

/** How much of a study's lease both surveys have data for. Sampled pixels can add up to a little more than the polygon, so it stops at the lease. */
export function coverage(r: Analysis["results"]) {
  const measuredM2 = Math.min(r.dtm_diff.area_m2, r.effective_m2);
  const pct = r.effective_m2 > 0 ? (measuredM2 / r.effective_m2) * 100 : 0;
  return {
    measuredM2,
    missingM2: r.effective_m2 - measuredM2,
    pct,
    short: r.effective_m2 > 0 && pct < FULL_COVERAGE_PCT,
  };
}
