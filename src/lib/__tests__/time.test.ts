import { test } from "node:test";
import assert from "node:assert/strict";
import { compareNewestFirst, formatTimestamp, isEpochMs } from "../time.ts";

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
