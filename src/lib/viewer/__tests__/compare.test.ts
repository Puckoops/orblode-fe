import { test } from "node:test";
import assert from "node:assert/strict";

import type { Measurement, Survey } from "../../api/orblodeSvc.ts";
import {
  defaultBeforeId,
  findPile,
  nextCompareSeed,
  pileDiff,
  pileIdOf,
  pileStateOf,
  sortSurveysChronological,
  temporalComparePair,
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

test("temporalComparePair detects a two-survey diff and orders A→B", () => {
  const params = {
    from: { type: "survey_terrain", survey_id: "a-1", surface: "dsm" },
    to: { type: "survey_terrain", survey_id: "b-2", surface: "dsm" },
  };
  assert.deepEqual(temporalComparePair(params), { aId: "a-1", bId: "b-2" });
});

test("temporalComparePair rejects single-survey and same-survey params", () => {
  assert.equal(temporalComparePair({ from: { type: "smart_base" }, to: { type: "survey_terrain", surface: "dsm" } }), null);
  assert.equal(
    temporalComparePair({ from: { type: "previous_survey", surface: "dsm" }, to: { type: "survey_terrain", surface: "dsm" } }),
    null
  );
  assert.equal(
    temporalComparePair({
      from: { type: "survey_terrain", survey_id: "x", surface: "dsm" },
      to: { type: "survey_terrain", survey_id: "x", surface: "dsm" },
    }),
    null
  );
  assert.equal(temporalComparePair(null), null);
  assert.equal(temporalComparePair({}), null);
});

const outline = { type: "Polygon", coordinates: [] };
const pile = (over: Partial<Measurement>): Measurement =>
  ({ id: "m", kind: "stockpile", status: "completed", geometry: outline, created_at: 1, updated_at: 1, ...over }) as Measurement;

test("pileIdOf falls back to the measurement id for a pile of its own", () => {
  assert.equal(pileIdOf(pile({ id: "m1" })), "m1");
  assert.equal(pileIdOf(pile({ id: "m2", pile_id: "m1" })), "m1");
});

test("findPile matches by pile id and skips drafts, outline-less rows and other kinds", () => {
  const list = [
    pile({ id: "draft", pile_id: "p", draft: true }),
    pile({ id: "bare", pile_id: "p", geometry: undefined }),
    pile({ id: "vol", pile_id: "p", kind: "volume" }),
    pile({ id: "kept", pile_id: "p" }),
  ];
  assert.equal(findPile(list, "p")?.id, "kept");
  assert.equal(findPile(list, "other"), null);
  assert.equal(findPile([pile({ id: "first" })], "first")?.id, "first");
});

test("pileStateOf mirrors the inventory's states", () => {
  const computed = { results: { stockpile: { metrics: { volume_m3: 10 } } }, computed_at: 5, updated_at: 5 };
  assert.equal(pileStateOf(pile(computed)), "computed");
  assert.equal(pileStateOf(pile({ ...computed, updated_at: 6 })), "stale");
  assert.equal(pileStateOf(pile({ ...computed, status: "computing" })), "computing");
  assert.equal(pileStateOf(pile({ status: "failed" })), "failed");
  assert.equal(pileStateOf(pile({ status: "draft" })), "not_computed");
});

test("pileStateOf: a rename keeps a pile computed, a failed recompute is failed", () => {
  const computed = { results: { stockpile: { metrics: { volume_m3: 10 } } }, computed_at: 5 };
  assert.equal(pileStateOf(pile({ ...computed, updated_at: 9, inputs_updated_at: 5 })), "computed");
  assert.equal(pileStateOf(pile({ ...computed, updated_at: 9, inputs_updated_at: 8 })), "stale");
  assert.equal(pileStateOf(pile({ ...computed, status: "failed", computed_at: 9, updated_at: 9 })), "failed");
  assert.equal(pileStateOf(pile({ ...computed, updated_at: 9, result_state: "fresh" })), "computed", "the server's state wins");
});

test("pileDiff takes B minus A with the change as a share of A", () => {
  const rows = pileDiff({ volume_m3: 200, tonnage_t: 300, area_m2: 50 }, { volume_m3: 250, tonnage_t: 270, area_m2: 50 });
  assert.deepEqual(rows, [
    { key: "volume_m3", label: "Volume", a: 200, b: 250, delta: 50, pct: 25 },
    { key: "tonnage_t", label: "Tonnage", a: 300, b: 270, delta: -30, pct: -10 },
    { key: "area_m2", label: "Area", a: 50, b: 50, delta: 0, pct: 0 },
  ]);
});

test("pileDiff leaves the change empty when a side has no number", () => {
  assert.deepEqual(pileDiff(null, { volume_m3: 40 }), [
    { key: "volume_m3", label: "Volume", a: null, b: 40, delta: null, pct: null },
  ]);
  assert.deepEqual(pileDiff({ volume_m3: 0 }, { volume_m3: 40 }), [
    { key: "volume_m3", label: "Volume", a: 0, b: 40, delta: 40, pct: null },
  ]);
  assert.deepEqual(pileDiff(null, null), []);
});
