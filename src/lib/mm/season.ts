import type { Season } from "../api/mm.ts";

/** The season a survey of this date belongs to, as the service tags it: January to May is before the monsoon,
 * October to December after it, and June to September is left for the planner. date is YYYY-MM-DD. */
export function seasonOf(date: string): Season | null {
  const month = Number(date.slice(5, 7));
  if (month >= 1 && month <= 5) return "pre";
  if (month >= 10 && month <= 12) return "post";
  return null;
}

export const SEASON_LABEL: Record<Season, string> = { pre: "Pre-monsoon", post: "Post-monsoon" };
