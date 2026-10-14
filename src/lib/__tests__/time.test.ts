import { test } from "node:test";
import assert from "node:assert/strict";
import { compareNewestFirst, dayDate, daysAgo, exactTime, formatTimestamp, isEpochMs, lastActive } from "../time.ts";

test("formatTimestamp renders epoch milliseconds as a UTC minute stamp", () => {
  assert.equal(formatTimestamp(Date.UTC(2026, 9, 6, 14, 5, 59, 999)), "2026-10-06 14:05");
  assert.equal(formatTimestamp(Date.UTC(2024, 0, 2, 3, 4)), "2024-01-02 03:04");
});

test("formatTimestamp is empty for a missing, zero or non-finite instant", () => {
  assert.equal(formatTimestamp(undefined), "");
  assert.equal(formatTimestamp(null), "");
  assert.equal(formatTimestamp(0), "");
  assert.equal(formatTimestamp(Number.NaN), "");
  assert.equal(formatTimestamp(Number.POSITIVE_INFINITY), "");
});

test("isEpochMs rejects the ISO strings the old contract sent", () => {
  assert.equal(isEpochMs(1_760_000_000_000), true);
  assert.equal(isEpochMs("2026-10-06T14:05:00Z"), false);
  assert.equal(isEpochMs(-1), false);
});

test("compareNewestFirst sorts later instants first and missing ones last", () => {
  const rows = [{ at: 1_000 }, { at: undefined }, { at: 3_000 }, { at: 2_000 }];
  const sorted = [...rows].sort((a, b) => compareNewestFirst(a.at, b.at)).map((r) => r.at);
  assert.deepEqual(sorted, [3_000, 2_000, 1_000, undefined]);
});

test("lastActive reads as now while a session keeps moving it, then counts by the calendar", () => {
  const now = new Date(2026, 9, 14, 9, 30).getTime();
  assert.equal(lastActive(now - 4 * 60_000, now), "Active now");
  assert.equal(lastActive(now + 60_000, now), "Active now");
  assert.equal(lastActive(now - 25 * 60_000, now), "25 min ago");
  assert.equal(lastActive(new Date(2026, 9, 14, 0, 5).getTime(), now), "9 h ago");
  assert.equal(lastActive(new Date(2026, 9, 13, 23, 0).getTime(), now), "Yesterday");
  assert.equal(lastActive(new Date(2026, 9, 10, 18, 0).getTime(), now), "4 days ago");
  assert.equal(lastActive(new Date(2026, 9, 3, 12, 0).getTime(), now), "3 Oct");
  assert.equal(lastActive(new Date(2025, 11, 31, 12, 0).getTime(), now), "31 Dec 2025");
});

test("daysAgo counts midnights, not 24-hour spans", () => {
  const now = new Date(2026, 9, 14, 0, 30).getTime();
  assert.equal(daysAgo(new Date(2026, 9, 13, 23, 50).getTime(), now), 1);
  assert.equal(daysAgo(new Date(2026, 9, 14, 0, 1).getTime(), now), 0);
});

test("exactTime spells the local day and minute", () => {
  assert.equal(exactTime(new Date(2026, 9, 14, 15, 42).getTime()), "Wed 14 Oct 2026, 15:42");
});

test("dayDate spells the local day with its year", () => {
  assert.equal(dayDate(new Date(2026, 9, 14, 23, 59).getTime()), "14 Oct 2026");
  assert.equal(dayDate(new Date(2025, 0, 2, 0, 1).getTime()), "2 Jan 2025");
});
