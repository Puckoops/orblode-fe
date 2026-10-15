import { test } from "node:test";
import assert from "node:assert/strict";

import type { Measurement, PinPileResult } from "../../api/orblodeSvc.ts";
import { pinOutcome } from "../pins.ts";

const measurement = { id: "m1" } as Measurement;
const copy = (n: number) => ({ survey_id: `s${n}`, survey_date: `2026-0${n}-01`, measurement_id: `c${n}` });
const result = (over: Partial<PinPileResult>): PinPileResult => ({ measurement, pinned: true, created: [], skipped: [], computing: 0, ...over });

test("pinning says how many surveys got the pile and whether they are computing", () => {
  assert.deepEqual(pinOutcome(result({ created: [copy(1), copy(2)], computing: 2 })), {
    title: "Pinned to every survey",
    description: "Added to 2 surveys and computing them in the background.",
    skipped: [],
  });
  assert.equal(pinOutcome(result({ created: [copy(1), copy(2)], computing: 1 })).description, "Added to 2 surveys and computing 1 in the background.");
  assert.equal(pinOutcome(result({ created: [copy(1)] })).description, "Added to 1 survey.");
});

test("pinning a pile every survey already has says so", () => {
  assert.equal(pinOutcome(result({})).description, "Every survey already had this pile.");
});

test("each survey left out is named with its reason", () => {
  const out = pinOutcome(result({ skipped: [{ survey_id: "s3", survey_date: "2026-03-01", reason: "Pile B already covers it" }] }));
  assert.deepEqual(out.skipped, ["1 Mar 2026: Pile B already covers it"]);
  assert.equal(out.description, undefined);
});

test("unpinning keeps the copies", () => {
  assert.deepEqual(pinOutcome(result({ pinned: false })), { title: "Unpinned", description: "The copies in other surveys stay as they are.", skipped: [] });
});
