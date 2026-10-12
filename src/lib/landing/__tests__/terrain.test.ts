import { test } from "node:test";
import assert from "node:assert/strict";

import { EARLIER_PILE_SCALE, Material, PIT, PILES, RIM, cutFillTotals, pileOutline, pileStats, sample } from "../terrain.ts";

test("the pit floor holds a pond at its lowest level", () => {
  const floor = sample(PIT.x, PIT.y);
  assert.equal(floor.material, Material.Water);
  assert.equal(floor.z, RIM - PIT.depth - 0.6);
});

test("Stockpile 1 stands above the pad around it", () => {
  const top = sample(PILES[0].x, PILES[0].y);
  assert.equal(top.material, Material.Stockpile);
  assert.equal(top.pile, 0);
  assert.ok(top.z > 46 + PILES[0].height * 0.8);
});

test("pileStats scales with the stockpile's height and not its footprint", () => {
  const now = pileStats(), earlier = pileStats(PILES[0], EARLIER_PILE_SCALE);
  assert.ok(now.volume > 10_000);
  assert.ok(Math.abs(earlier.volume / now.volume - EARLIER_PILE_SCALE) < 0.01);
  assert.ok(Math.abs(earlier.footprint - now.footprint) / now.footprint < 0.02);
});

test("pileOutline rings the stockpile just outside its toe", () => {
  const ring = pileOutline();
  assert.equal(ring.length, 48);
  for (const [x, y] of ring) assert.notEqual(sample(x, y).pile, 0);
});

test("cutFillTotals finds both cut and fill on the graded pad", () => {
  const { cut, fill } = cutFillTotals(2);
  assert.ok(cut > 0 && fill > 0);
});
