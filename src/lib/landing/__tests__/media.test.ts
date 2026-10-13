import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { lookAheadOnNarrow, type Camera } from "../descent.ts";
import {
  coverPoint,
  coverRect,
  formatMeasurement,
  frameForStage,
  frameForTime,
  heroYaw,
  loadOrder,
  measureBetween,
  mediaFiles,
  sampleTrack,
  scaleBar,
  timeForFrame,
  validateMedia,
  wrapIndex,
} from "../media.ts";

test("frameForStage runs from the first frame to the last and holds each stage on one frame", () => {
  assert.equal(frameForStage(0, 120), 0);
  assert.equal(frameForStage(3, 120), 360);
  assert.equal(frameForStage(-1, 120), 0);
  assert.equal(frameForStage(4, 120), 360);
  assert.equal(frameForStage(1, 120), 120);
  let previous = -1;
  for (let s = 0; s <= 3; s += 0.01) {
    const f = frameForStage(s, 80);
    assert.ok(f >= previous);
    previous = f;
  }
});

test("timeForFrame seeks to the middle of a frame, which frameForTime maps back", () => {
  for (const f of [0, 1, 59, 360]) assert.equal(frameForTime(timeForFrame(f, 30), 30), f);
});

test("wrapIndex keeps a turntable index in range in both directions", () => {
  assert.equal(wrapIndex(-1, 72), 71);
  assert.equal(wrapIndex(72, 72), 0);
  assert.equal(wrapIndex(145, 72), 1);
  assert.equal(wrapIndex(3.6, 72), 4);
});

test("heroYaw ends its loop where it starts, at about the old orbit's average speed", () => {
  const loop = 24, sway = 0.22;
  assert.ok(Math.abs(heroYaw(0, 0.5, sway, loop) - heroYaw(loop, 0.5, sway, loop)) < 1e-9);
  const meanSpeed = (4 * sway) / loop;
  assert.ok(Math.abs(meanSpeed - 0.035) < 0.003);
});

test("sampleTrack is null outside the frames it covers", () => {
  const track = { start: 10, points: [[0.1, 0.2], null, [0.3, 0.4]] as ([number, number] | null)[] };
  assert.equal(sampleTrack(track, 9), null);
  assert.deepEqual(sampleTrack(track, 10), [0.1, 0.2]);
  assert.equal(sampleTrack(track, 11), null);
  assert.deepEqual(sampleTrack(track, 12), [0.3, 0.4]);
  assert.equal(sampleTrack(track, 13), null);
});

test("coverRect fills the box and crops the overflowing side, centred", () => {
  const wide = coverRect({ width: 1600, height: 600 }, { width: 1600, height: 900 });
  assert.deepEqual(wide, { x: 0, y: -150, width: 1600, height: 900 });
  const tall = coverRect({ width: 400, height: 900 }, { width: 1600, height: 900 });
  assert.equal(tall.height, 900);
  assert.equal(tall.x, -600);
  assert.deepEqual(coverPoint(wide, [0.5, 0.5]), [800, 300]);
});

test("scaleBar picks the first round length at least 70 px long", () => {
  assert.deepEqual(scaleBar(1), { metres: 100, px: 100 });
  assert.equal(scaleBar(0.2).metres, 20);
  assert.equal(scaleBar(100).metres, 1000);
});

test("formatMeasurement matches the readout the live viewer showed", () => {
  const m = formatMeasurement(measureBetween([0, 0, 10], [30, 40, 4]));
  assert.deepEqual(m, { distance: "50.4 m", horizontal: "50.0 m", height: "−6.0 m", grade: "12.0%" });
  assert.equal(formatMeasurement(measureBetween([1, 1, 0], [1, 1.01, 2])).grade, "–");
});

test("loadOrder visits every frame once, spreading the first ones around the turn", () => {
  const order = loadOrder(72);
  assert.equal(order.length, 72);
  assert.equal(new Set(order).size, 72);
  assert.deepEqual(order.slice(0, 4), [0, 36, 18, 54]);
});

test("lookAheadOnNarrow leaves the camera alone until the site shows", () => {
  const cam: Camera = { tx: 1, ty: 2, tz: 0, yaw: 0.6, pitch: 0.7, dist: 500, fov: 0.82 };
  assert.deepEqual(lookAheadOnNarrow({ ...cam }, 0.5), cam);
  const moved = lookAheadOnNarrow({ ...cam }, 2);
  assert.ok(moved.tx > cam.tx && moved.ty > cam.ty);
});

test("validateMedia refuses a manifest without its renditions", () => {
  assert.throws(() => validateMedia({ version: 1 }), /landing media/);
  assert.throws(() => validateMedia(null), /version/);
});

test("the committed manifest validates and every file it names is in public/", () => {
  const root = path.resolve(import.meta.dirname, "../../../..");
  const media = validateMedia(JSON.parse(readFileSync(path.join(root, "src/lib/landing/media.json"), "utf8")));
  assert.deepEqual(
    mediaFiles(media).filter((file) => !existsSync(path.join(root, "public", file))),
    [],
  );
});
