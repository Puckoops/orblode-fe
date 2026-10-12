import { test } from "node:test";
import assert from "node:assert/strict";

import { altitudeFraction, altitudeOf, cameraAt, formatAltitude, stageAltitudes, stageAt, type Camera } from "../descent.ts";

const camera = (): Camera => ({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 0, fov: 0.82 });

test("stageAt holds each stage before easing into the next", () => {
  assert.equal(stageAt(0), 0);
  assert.equal(stageAt(0.13), 0);
  assert.equal(stageAt(0.27), 1);
  assert.equal(stageAt(0.41), 1);
  assert.equal(stageAt(0.69), 2);
  assert.equal(stageAt(0.83), 3);
  assert.equal(stageAt(1), 3);
  assert.equal(stageAt(1.4), 3);
});

test("stageAt never moves backwards as the page scrolls down", () => {
  let previous = -1;
  for (let p = 0; p <= 1; p += 0.005) {
    const s = stageAt(p);
    assert.ok(s >= previous, `stage went back at progress ${p}`);
    previous = s;
  }
});

test("cameraAt is continuous where the descent hands from one pose to the next", () => {
  for (const s of [1, 2]) {
    const before = cameraAt(s - 1e-6, 0, false, camera()), after = cameraAt(s + 1e-6, 0, false, camera());
    assert.ok(Math.abs(before.dist - after.dist) < 0.01, `dist jumps at s=${s}`);
    assert.ok(Math.abs(before.pitch - after.pitch) < 1e-4, `pitch jumps at s=${s}`);
  }
});

test("cameraAt pulls back from the site while the globe is still showing", () => {
  assert.ok(cameraAt(0.5, 0, false, camera()).dist > cameraAt(1, 0, false, camera()).dist * 3);
});

test("the altimeter descends with the stages", () => {
  const heights = [1, 2, 3].map((s) => altitudeOf(cameraAt(s, 0, false, camera())));
  assert.ok(heights[0] > heights[1] && heights[1] > heights[2]);
  assert.deepEqual(stageAltitudes().slice(0, 2), ["20,000 km", "1.5 km"]);
});

test("altitudeFraction places orbit at the top and 20 m at the bottom of a log scale", () => {
  assert.equal(altitudeFraction(2e7), 0);
  assert.equal(altitudeFraction(20), 1);
  assert.ok(Math.abs(altitudeFraction(20_000) - 0.5) < 1e-9);
  assert.equal(altitudeFraction(0), 1);
});

test("formatAltitude switches to kilometres above 1 km", () => {
  assert.equal(formatAltitude(20_000_000), "20,000 km");
  assert.equal(formatAltitude(1486), "1.5 km");
  assert.equal(formatAltitude(312.4), "312 m");
});
