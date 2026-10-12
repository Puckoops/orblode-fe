import { test } from "node:test";
import assert from "node:assert/strict";

import { frameFor, gridProfile, heightOn, type SurveyGrid } from "../grid.ts";
import { contourInterval, isNoData, tileBounds, tileOf } from "../raster.ts";

const grid: SurveyGrid = {
  nx: 4,
  ny: 3,
  cell: 10,
  x0: -20,
  y1: 15,
  // Heights rise to the east; the north-east corner is a hole.
  z: Float32Array.from([0, 10, 20, NaN, 0, 10, 20, 30, 0, 10, 20, 30]),
};

test("heightOn interpolates between cell centres and ignores holes", () => {
  assert.equal(heightOn(grid, -15, 5), 0);
  assert.equal(heightOn(grid, -10, 5), 5);
  assert.equal(heightOn(grid, 15, 0), 30);
  assert.ok(Number.isNaN(heightOn(grid, 15, 10)), "the hole itself has no height");
  assert.ok(Number.isNaN(heightOn(grid, 100, 0)));
});

test("frameFor centres on the data and frames the featured measurement", () => {
  const frame = frameFor(grid, { name: "Pile", outline: [], centre: [-10, 0], reach: 4, volume: 1, area: null, base: null, computedAt: null });
  assert.deepEqual([frame.cx, frame.cy], [0, 0]);
  assert.equal(frame.radius, 50);
  assert.deepEqual(frame.extent, [-20, -15, 20, 15]);
  assert.deepEqual(frame.focus, { x: -10, y: 0, z: 5, reach: 4 });
});

test("gridProfile walks west to east across the data", () => {
  const points = gridProfile(grid, 0, 10);
  assert.equal(points[0][0], 0);
  assert.ok(points.every(([, z], i) => i === 0 || z >= points[i - 1][1]));
});

test("tileOf puts the antimeridian and equator where XYZ expects", () => {
  assert.deepEqual(tileOf(0, 0, 1), [1, 1]);
  const [x, y] = tileOf(-180, 85.0511287798, 3);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-6);
});

test("tileBounds steps the zoom down to stay within the tile budget", () => {
  const sharp = tileBounds(151.2, -32.41, 151.21, -32.4, 3, 10, 22);
  assert.ok(sharp.z >= 17);
  const capped = tileBounds(151.2, -32.41, 151.21, -32.4, 0.1, 10, 22, 16);
  assert.ok((capped.x1 - capped.x0 + 1) * (capped.y1 - capped.y0 + 1) <= 16);
});

test("isNoData and contourInterval", () => {
  assert.ok(isNoData(-9999, -9999));
  assert.ok(isNoData(-3.4e38, null));
  assert.ok(!isNoData(42, -9999));
  assert.equal(contourInterval(60), 2);
  assert.equal(contourInterval(6), 0.25);
});
