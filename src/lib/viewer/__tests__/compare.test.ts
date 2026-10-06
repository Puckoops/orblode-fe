import { test } from "node:test";
import assert from "node:assert/strict";

import type { Survey } from "../../api/orblodeSvc.ts";
import {
  defaultBeforeId,
  nextCompareSeed,
  sortSurveysChronological,
} from "../compare.ts";

// Minimal fixture — the compare helpers only read id + survey_date.
const sv = (id: string, survey_date: string): Survey =>
  ({ id, survey_date }) as unknown as Survey;

test("sortSurveysChronological orders oldest→newest and drops undated", () => {
  const out = sortSurveysChronological([
    sv("c", "2024-03-01"),
    sv("a", "2024-01-01"),
    sv("x", ""), // undated — cannot be placed on the timeline
    sv("b", "2024-02-01"),
  ]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["a", "b", "c"]
  );
});

test("defaultBeforeId returns the immediately-earlier epoch", () => {
  const list = [sv("a", "2024-01-01"), sv("b", "2024-02-01"), sv("c", "2024-03-01")];
  assert.equal(defaultBeforeId(list, "c"), "b");
  assert.equal(defaultBeforeId(list, "b"), "a");
});

test("defaultBeforeId on the earliest falls back to next-newer (never self)", () => {
  const list = [sv("a", "2024-01-01"), sv("b", "2024-02-01")];
  assert.equal(defaultBeforeId(list, "a"), "b");
});

test("defaultBeforeId: unknown current → newest; empty list → null", () => {
  const list = [sv("a", "2024-01-01"), sv("b", "2024-02-01")];
  assert.equal(defaultBeforeId(list, "zzz"), "b");
  assert.equal(defaultBeforeId([], "a"), null);
});

test("nextCompareSeed seeds B=current, A=prev epoch when unset", () => {
  const surveys = [sv("a", "2024-01-01"), sv("b", "2024-02-01"), sv("c", "2024-03-01")];
  assert.deepEqual(
    nextCompareSeed({ surveyId: "c", surveys, compareA: null, compareB: null }),
    { a: "b", b: "c" }
  );
});

test("nextCompareSeed preserves an already-picked A/B (idempotent toggle)", () => {
  const surveys = [sv("a", "2024-01-01"), sv("b", "2024-02-01"), sv("c", "2024-03-01")];
  assert.deepEqual(
    nextCompareSeed({ surveyId: "c", surveys, compareA: "a", compareB: "b" }),
    { a: "a", b: "b" }
  );
});
