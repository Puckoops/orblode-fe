/** orblode-svc instants (`created_at`, `updated_at`, every `*_at`) are integer epoch milliseconds. */
export type EpochMs = number;

export function isEpochMs(value: unknown): value is EpochMs {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD HH:mm` in UTC, or "" when there is no usable instant. */
export function formatTimestamp(ms: EpochMs | null | undefined): string {
  if (!isEpochMs(ms)) return "";
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Newest first; a missing instant sorts last. */
export function compareNewestFirst(a: EpochMs | null | undefined, b: EpochMs | null | undefined): number {
  return (isEpochMs(b) ? b : 0) - (isEpochMs(a) ? a : 0);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How many local midnights lie between then and now: 0 today, 1 yesterday. */
export function daysAgo(then: EpochMs, now: EpochMs): number {
  const a = new Date(then);
  const b = new Date(now);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/** "12 Oct", with the year when it isn't now's. */
export function shortDate(ms: EpochMs, now: EpochMs): string {
  const d = new Date(ms);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/** "15:42" in the viewer's time. */
export function clockTime(ms: EpochMs): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Mon 15:42" in the viewer's time. */
export function weekdayTime(ms: EpochMs): string {
  return `${WEEKDAYS[new Date(ms).getDay()]} ${clockTime(ms)}`;
}

/** "14 Oct 2026" in the viewer's time. */
export function dayDate(ms: EpochMs): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Tue 14 Oct 2026, 15:42" in the viewer's time, for a tooltip under a relative time. */
export function exactTime(ms: EpochMs): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** user-svc moves last active at most every 5 minutes, so anything inside 10 still means "now". */
export const ACTIVE_NOW_MS = 10 * 60_000;

/** People's last active: "Active now", then "25 min ago", "3 h ago", "Yesterday", "4 days ago" and a date. */
export function lastActive(ms: EpochMs, now: EpochMs): string {
  if (now - ms < ACTIVE_NOW_MS) return "Active now";
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const days = daysAgo(ms, now);
  if (days === 0) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(ms, now);
}
