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
