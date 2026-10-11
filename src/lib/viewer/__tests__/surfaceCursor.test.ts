import { test } from "node:test";
import assert from "node:assert/strict";

import { CURSOR_RING_PX, CURSOR_STEM_PX, easeNormal, markGeometry, planeNormal } from "../surfaceCursor.ts";

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const v = (x: number, y: number, z: number) => ({ x, y, z });

test("planeNormal faces the side it is pointed toward", () => {
  const a = v(0, 0, 0);
  const b = v(1, 0, 0);
  const c = v(0, 1, 0);
  assert.deepEqual(planeNormal(a, b, c, v(0, 0, 5)), v(0, 0, 1));
  assert.deepEqual(planeNormal(a, b, c, v(0, 0, -5)), v(-0, -0, -1));
});

test("planeNormal follows a slope", () => {
  const n = planeNormal(v(0, 0, 0), v(1, 0, 1), v(0, 1, 0), v(0, 0, 1))!;
  near(n.x, -Math.SQRT1_2);
  near(n.y, 0);
  near(n.z, Math.SQRT1_2);
});

test("planeNormal gives up on collinear samples", () => {
  assert.equal(planeNormal(v(0, 0, 0), v(1, 1, 1), v(2, 2, 2), v(0, 0, 1)), null);
});

test("easeNormal starts on the target and reports settled", () => {
  assert.deepEqual(easeNormal(null, v(0, 0, 1)), { normal: v(0, 0, 1), settled: true });
});

test("easeNormal moves part way, then settles", () => {
  const target = v(0, 0, 1);
  let step = easeNormal(v(1, 0, 0), target);
  assert.equal(step.settled, false);
  assert.ok(step.normal.z > 0 && step.normal.x > 0);
  for (let i = 0; i < 50 && !step.settled; i++) step = easeNormal(step.normal, target);
  assert.equal(step.settled, true);
  assert.deepEqual(step.normal, target);
});

test("easeNormal jumps when the target faces the other way", () => {
  assert.deepEqual(easeNormal(v(0, 0, -1), v(0, 0, 1)), { normal: v(0, 0, 1), settled: true });
});

test("markGeometry lays the ring flat on the surface and stands the line on its normal", () => {
  const center = v(10, 20, 30);
  const normal = v(0, Math.SQRT1_2, Math.SQRT1_2);
  const mpp = 0.5;
  const g = markGeometry(center, normal, mpp);
  for (const p of g.ring) {
    const d = v(p.x - center.x, p.y - center.y, p.z - center.z);
    near(Math.hypot(d.x, d.y, d.z), CURSOR_RING_PX * mpp);
    near(d.x * normal.x + d.y * normal.y + d.z * normal.z, 0);
  }
  near(g.stemStart.y, center.y - CURSOR_RING_PX * mpp * Math.SQRT1_2);
  near(g.stemTip.z, center.z + CURSOR_STEM_PX * mpp * Math.SQRT1_2);
  near(g.stemTip.x, center.x);
});
