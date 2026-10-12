import { test } from "node:test";
import assert from "node:assert/strict";

import { altitudeAt, altitudeFraction, altitudeOf, cameraAt, formatAltitude, posesFor, stageAltitudes, stageAt, type Camera } from "../descent.ts";
import { SAMPLE_FRAME } from "../site.ts";

const camera = (): Camera => ({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 0, fov: 0.82 });
const poses = posesFor(SAMPLE_FRAME);
const ground = SAMPLE_FRAME.ground;

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
    const before = cameraAt(s - 1e-6, 0, false, poses, camera()), after = cameraAt(s + 1e-6, 0, false, poses, camera());
    assert.ok(Math.abs(before.dist - after.dist) < 0.01, `dist jumps at s=${s}`);
    assert.ok(Math.abs(before.pitch - after.pitch) < 1e-4, `pitch jumps at s=${s}`);
  }
});

test("cameraAt pulls back from the site while the globe is still showing", () => {
  assert.ok(cameraAt(0.5, 0, false, poses, camera()).dist > cameraAt(1, 0, false, poses, camera()).dist * 3);
});

test("the altimeter descends with the stages", () => {
  const heights = [1, 2, 3].map((s) => altitudeOf(cameraAt(s, 0, false, poses, camera()), ground));
  assert.ok(heights[0] > heights[1] && heights[1] > heights[2]);
  assert.deepEqual(stageAltitudes(poses, ground).slice(0, 2), ["20,000 km", "1.5 km"]);
});

test("the altimeter hands over from the globe to the camera without a jump", () => {
  const cam = camera();
  const before = altitudeAt(0.7199, cameraAt(0.7199, 0, false, poses, cam), poses, ground);
  const after = altitudeAt(0.72, cameraAt(0.72, 0, false, poses, cam), poses, ground);
  assert.ok(Math.abs(before - after) / after < 0.01, `${before} vs ${after}`);
});

test("posesFor scales the descent to a smaller site and frames its measurement", () => {
  const extent: [number, number, number, number] = [-90, -105, 110, 95];
  const small = posesFor({ cx: 10, cy: -5, radius: 100, extent, ground: 12, low: 8, focus: { x: 30, y: 20, z: 15, reach: 8 } });
  assert.equal(small[0].dist, 350);
  assert.deepEqual([small[2].tx, small[2].ty, small[2].tz], [30, 20, 15]);
  assert.equal(small[2].dist, 48);
  const unfocused = posesFor({ cx: 0, cy: 0, radius: 100, extent, ground: 12, low: 8, focus: null });
  assert.deepEqual([unfocused[2].tx, unfocused[2].ty, unfocused[2].tz], [0, 0, 12]);
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
