import type { PinPileResult } from "../api/orblodeSvc.ts";
import { formatSurveyDate } from "../utils.ts";

const surveys = (n: number) => `${n} survey${n === 1 ? "" : "s"}`;

/** What pinning or unpinning did, as a toast title and one line per survey it left out. */
export function pinOutcome(result: PinPileResult): { title: string; description?: string; skipped: string[] } {
  const skipped = result.skipped.map((s) => `${formatSurveyDate(s.survey_date)}: ${s.reason}`);
  if (!result.pinned) return { title: "Unpinned", description: "The copies in other surveys stay as they are.", skipped };
  const added = result.created.length;
  if (added === 0) {
    return { title: "Pinned to every survey", description: result.skipped.length ? undefined : "Every survey already had this pile.", skipped };
  }
  const computing = result.computing > 0 ? ` and computing ${result.computing === added ? "them" : result.computing} in the background` : "";
  return { title: "Pinned to every survey", description: `Added to ${surveys(added)}${computing}.`, skipped };
}
