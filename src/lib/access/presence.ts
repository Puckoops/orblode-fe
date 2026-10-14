import { ACTIVE_NOW_MS, daysAgo, type EpochMs } from "../time.ts";

/** How recently someone used the organisation; People fades each step further. */
export type Presence = "now" | "today" | "week" | "month" | "dormant";

export function presence(ms: EpochMs, now: EpochMs): Presence {
  if (now - ms < ACTIVE_NOW_MS) return "now";
  const days = daysAgo(ms, now);
  if (days === 0) return "today";
  if (days < 7) return "week";
  if (days < 30) return "month";
  return "dormant";
}
