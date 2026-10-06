// Compare Mode helpers (survey-compare swipe) — the pure, Cesium-free glue
// shared by the two entry points (the bottom-center `SurveyCompare` swipe
// control and the FloatingToolbar's Compare split-button). Kept in one module
// so the epoch-sorting and activation-seeding have a single source of truth
// and can be unit-tested without React.

import type { Survey } from "@/lib/api/orblodeSvc";

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
