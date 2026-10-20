import { test } from "node:test";
import assert from "node:assert/strict";
import { ringAreaM2, type Ring } from "../boundary.ts";
import { circle } from "../nogo.ts";

test("a keep-away circle is closed and holds the area of its radius", () => {
  const ring = (circle(85.8, 20.3, 200).coordinates as Ring[])[0];
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  const area = ringAreaM2(ring);
  const expected = Math.PI * 200 * 200;
  assert.ok(Math.abs(area - expected) / expected < 0.01, `${area} against ${expected}`);
});
