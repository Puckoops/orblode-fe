import { test } from "node:test";
import assert from "node:assert/strict";

import {
  autoRange,
  bandStep,
  histogramBars,
  legendGradient,
  noDataFloor,
  paintRamp,
  percentileRange,
  rampColor,
  rampPosition,
} from "../elevationRamp.ts";
import type { TerrainStats } from "@/lib/api/orblodeSvc";

const flat = (n: number, value = 1) => Array.from({ length: n }, () => value);

const stats = (over: Partial<TerrainStats> = {}): TerrainStats => ({
  min_elevation: 100,
  max_elevation: 200,
  mean: 150,
  std_dev: 20,
  histogram: flat(100),
  histogram_min: 100,
  histogram_max: 200,
  ...over,
});

test("a uniform histogram clips 2% off each end", () => {
  const r = percentileRange(stats());
  assert.ok(Math.abs(r.min - 102) < 1e-9);
  assert.ok(Math.abs(r.max - 198) < 1e-9);
});

test("a lone spike far above the site does not stretch the range", () => {
  const histogram = flat(100, 0);
  for (let i = 0; i < 20; i++) histogram[i] = 100;
  histogram[99] = 1;
  const r = percentileRange(stats({ histogram, max_elevation: 300, histogram_max: 300 }));
  assert.ok(r.max < 160, `max ${r.max}`);
});

test("without a histogram the range is the surface's min and max", () => {
  assert.deepEqual(percentileRange(stats({ histogram: undefined })), { min: 100, max: 200 });
});

test("a flat surface still gets half a metre of range", () => {
  const r = percentileRange(stats({ min_elevation: 50, max_elevation: 50, histogram: undefined }));
  assert.equal(r.max - r.min, 0.5);
  assert.equal((r.min + r.max) / 2, 50);
});

test("the automatic range rounds outward to the decimetre", () => {
  const r = autoRange(stats({ histogram: undefined, min_elevation: 70.27, max_elevation: 219.61 }));
  assert.deepEqual(r, { min: 70.2, max: 219.7 });
});

test("the no-data floor sits below the surface's lowest cell", () => {
  assert.equal(noDataFloor(stats()), 95);
  assert.equal(noDataFloor(stats({ min_elevation: 10, max_elevation: 12 })), 9);
});

test("band steps are round heights giving about ten bands", () => {
  assert.equal(bandStep({ min: 0, max: 100 }), 10);
  assert.equal(bandStep({ min: 70, max: 220 }), 20);
  assert.equal(bandStep({ min: 0, max: 22 }), 2);
  assert.equal(bandStep({ min: 0, max: 30 }), 2.5);
  assert.equal(bandStep({ min: 0, max: 4 }), 0.5);
});

test("ramp ends are the first and last stop", () => {
  assert.deepEqual(rampColor("grayscale", 0), [0, 0, 0]);
  assert.deepEqual(rampColor("grayscale", 1), [255, 255, 255]);
  assert.deepEqual(rampColor("grayscale", 0.5), [128, 128, 128]);
  assert.deepEqual(rampColor("grayscale", 7), [255, 255, 255]);
});

test("heights outside the range take the end colours", () => {
  const range = { min: 100, max: 200 };
  assert.equal(rampPosition(50, range, false), 0);
  assert.equal(rampPosition(250, range, false), 1);
  assert.equal(rampPosition(150, range, false), 0.5);
});

test("bands share one colour per round step", () => {
  const range = { min: 100, max: 200 };
  assert.equal(rampPosition(110.1, range, true), rampPosition(119.9, range, true));
  assert.notEqual(rampPosition(119.9, range, true), rampPosition(120.1, range, true));
  assert.equal(rampPosition(100, range, true), 0);
  assert.equal(rampPosition(199, range, true), 1);
});

test("the painted ramp runs from the bottom colour to the top colour", () => {
  const texels = paintRamp("grayscale", { min: 0, max: 10 }, false, 4);
  assert.equal(texels.length, 16);
  assert.ok(texels[0] < texels[12]);
  assert.equal(texels[3], 255);
});

test("the banded legend has a hard edge at each band", () => {
  const g = legendGradient("grayscale", { min: 0, max: 20 }, true);
  assert.match(g, /^linear-gradient\(to top, /);
  assert.equal(g.match(/rgb\(/g)?.length, 20);
});

test("histogram bars group buckets and carry their middle height", () => {
  const bars = histogramBars(stats({ histogram: flat(64) }), 32);
  assert.equal(bars.length, 32);
  assert.equal(bars[0].count, 2);
  assert.ok(Math.abs(bars[0].height - (100 + 100 / 64)) < 1e-9);
});
