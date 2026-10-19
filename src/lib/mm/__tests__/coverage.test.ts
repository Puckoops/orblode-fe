import { test } from "node:test";
import assert from "node:assert/strict";
import type { Analysis } from "../../api/mm.ts";
import { coverage } from "../coverage.ts";

const results = (measuredM2: number, effectiveM2: number) =>
  ({
    effective_m2: effectiveM2,
    dtm_diff: { area_m2: measuredM2 },
  }) as Analysis["results"];

test("the pilot lease is short of data on 78 of its 251 ha", () => {
  const c = coverage(results(1726017.5, 2505524.8));
  assert.equal(c.short, true);
  assert.equal(c.pct.toFixed(1), "68.9");
  assert.equal(Math.round(c.missingM2 / 1e4), 78);
});

test("pixels adding up past the polygon count as the whole lease, not more", () => {
  assert.deepEqual(coverage(results(250181.7, 250000)), {
    measuredM2: 250000,
    missingM2: 0,
    pct: 100,
    short: false,
  });
});

test("a lease measured on 96 % of it has no gap to warn about", () => {
  assert.equal(coverage(results(9600, 10000)).short, false);
});
