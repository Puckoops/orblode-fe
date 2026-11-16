// Compare Mode helpers — the pure, Cesium-free glue shared by the two entry
// points (the bottom-center `SurveyCompare` swipe control and the
// FloatingToolbar's Compare split-button) plus the comparison card. Kept in one
// module so the epoch-sorting, activation-seeding, temporal-pair detection and
// stockpile A/B diff have a single source of truth and can be unit-tested
// without React. The cross-survey SurfaceRef pair itself lives in calc.ts
// (`crossSurveyRefs`).

import type { Measurement, PileState, Survey } from "@/lib/api/orblodeSvc";

import { metricsOf, resultForKind } from "./calc.ts";
import { resultStateOf } from "./resultState.ts";

/** Chronological (oldest → newest) so "before"/"after" reads naturally; drops
 * undated surveys (they can't be placed on the timeline). Copies before sort. */
export function sortSurveysChronological(surveys: Survey[]): Survey[] {
  return surveys
    .filter((s) => s.survey_date)
    .slice()
    .sort((a, b) => a.survey_date.localeCompare(b.survey_date));
}

/** Default A ("before") for a freshly-activated compare: the epoch immediately
 * earlier than the current survey. If the current survey is the earliest (no
 * earlier epoch exists) fall back to the next-newer sibling so A never collides
 * with B — a self-comparison would render identical orthos on both sides. */
export function defaultBeforeId(
  sortedOldestFirst: Survey[],
  currentId: string
): string | null {
  if (sortedOldestFirst.length === 0) return null;
  const i = sortedOldestFirst.findIndex((s) => s.id === currentId);
  if (i < 0) return sortedOldestFirst[sortedOldestFirst.length - 1]?.id ?? null;
  if (i > 0) return sortedOldestFirst[i - 1].id; // immediately-earlier epoch
  return sortedOldestFirst[1]?.id ?? sortedOldestFirst[0].id; // earliest → next-newer
}

export interface CompareSeedInput {
  surveyId: string;
  surveys: Survey[];
  compareA: string | null;
  compareB: string | null;
}

/** The A/B ids to write when compare is toggled ON. Idempotent: an already-set
 * A/B is preserved (the user's pick survives a toggle off→on), otherwise B seeds
 * to the current survey and A to the immediately-earlier epoch. Shared by both
 * activation entry points so their seeding never drifts. */
export function nextCompareSeed({
  surveyId,
  surveys,
  compareA,
  compareB,
}: CompareSeedInput): { a: string | null; b: string } {
  return {
    b: compareB ?? surveyId,
    a: compareA ?? defaultBeforeId(surveys, surveyId),
  };
}

/** Detects a TEMPORAL compare measurement: params whose `from` and `to` both
 * name explicit — and different — surveys via `survey_terrain` refs (what a
 * draw-to-compare commit writes, `crossSurveyRefs`). Returns the ordered
 * before/after survey ids, or null for a single-survey measurement (whose `to`
 * carries no survey_id). The comparison card keys off this. */
export function temporalComparePair(
  params: Record<string, unknown> | null | undefined
): { aId: string; bId: string } | null {
  if (!params) return null;
  const from = params.from as Record<string, unknown> | undefined;
  const to = params.to as Record<string, unknown> | undefined;
  const aId = from && from.type === "survey_terrain" && typeof from.survey_id === "string" ? from.survey_id : null;
  const bId = to && to.type === "survey_terrain" && typeof to.survey_id === "string" ? to.survey_id : null;
  if (!aId || !bId || aId === bId) return null;
  return { aId, bId };
}

/** A stockpile's identity across surveys; the first survey's pile is its own id. */
export function pileIdOf(m: Pick<Measurement, "id" | "pile_id">): string {
  return m.pile_id || m.id;
}

/** What the inventory counts as a pile: a kept stockpile with an outline. */
export function isSavedStockpile(m: Pick<Measurement, "kind" | "draft" | "geometry">): boolean {
  return m.kind === "stockpile" && !m.draft && !!m.geometry;
}

export function findPile(measurements: Measurement[], pileId: string): Measurement | null {
  return measurements.find((m) => isSavedStockpile(m) && pileIdOf(m) === pileId) ?? null;
}

/** The inventory's pile state, worked out the way orblode-svc does: a pile
 * whose inputs changed after its last compute is stale, and one whose last
 * compute failed is failed; either way it keeps its previous numbers. */
export function pileStateOf(m: Measurement): PileState {
  const hasResult = "volume_m3" in metricsOf(resultForKind(m));
  const state = resultStateOf(m);
  if (state === "computing") return "computing";
  if (state === "failed") return "failed";
  if (state === "fresh" && hasResult) return "computed";
  return hasResult ? "stale" : "not_computed";
}

const PILE_DIFF_METRICS: [key: string, label: string][] = [
  ["volume_m3", "Volume"],
  ["tonnage_t", "Tonnage"],
  ["value", "Value"],
  ["area_m2", "Area"],
];

export interface PileDiffRow {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  pct: number | null;
}

/** B against A for each headline metric either side has. */
export function pileDiff(a: Record<string, number> | null, b: Record<string, number> | null): PileDiffRow[] {
  const rows: PileDiffRow[] = [];
  for (const [key, label] of PILE_DIFF_METRICS) {
    const av = a?.[key] ?? null;
    const bv = b?.[key] ?? null;
    if (av === null && bv === null) continue;
    const delta = av !== null && bv !== null ? bv - av : null;
    const pct = delta !== null && av ? (delta / av) * 100 : null;
    rows.push({ key, label, a: av, b: bv, delta, pct });
  }
  return rows;
}
