import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRID_FADE_PX,
  containsExtent,
  formatGridSpacing,
  gridLevel,
  gridValues,
  minorOpacity,
  squareAround,
  visibleSpacing,
} from "../grid.ts";
import { GRID_INK, GRID_INK_2D, GRID_INK_ON_LIGHT_MAP, GRID_OPACITY, GRID_OPACITY_2D, gridInk } from "../sceneStyle.ts";

const near = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test("gridLevel picks the smallest power of ten at least GRID_FADE_PX wide", () => {
  assert.deepEqual(gridLevel(0.25), { minor: 10, major: 100 });
  assert.deepEqual(gridLevel(1), { minor: 10, major: 100 });
  assert.deepEqual(gridLevel(1.01), { minor: 100, major: 1000 });
  near(gridLevel(0.004)!.minor, 0.1);
});

test("gridLevel rejects unusable scales", () => {
  assert.equal(gridLevel(0), null);
  assert.equal(gridLevel(-1), null);
  assert.equal(gridLevel(Number.NaN), null);
  assert.equal(gridLevel(Number.POSITIVE_INFINITY), null);
});

test("minor lines fade in from GRID_FADE_PX to ten times that apart", () => {
  assert.equal(minorOpacity(10, 10 / GRID_FADE_PX), 0);
  near(minorOpacity(10, 10 / (GRID_FADE_PX * Math.sqrt(10))), 0.5);
  assert.equal(minorOpacity(10, 10 / (GRID_FADE_PX * 10)), 1);
  assert.equal(minorOpacity(10, 10 / (GRID_FADE_PX * 50)), 1);
});

test("crossing into the next power keeps every line's opacity", () => {
  const justAbove = gridLevel(1.0001)!;
  const justBelow = gridLevel(0.9999)!;
  assert.equal(justAbove.minor, justBelow.major);
  near(minorOpacity(justAbove.minor, 1.0001), 1, 1e-6);
  near(minorOpacity(justBelow.minor, 0.9999), 0, 1e-6);
});

test("visibleSpacing reports the minor lines once they show", () => {
  const level = { minor: 10, major: 100 };
  assert.equal(visibleSpacing(level, 10 / GRID_FADE_PX), 100);
  assert.equal(visibleSpacing(level, 10 / (GRID_FADE_PX * 2.5)), 10);
});

test("gridValues lists the multiples in range and can skip the majors", () => {
  assert.deepEqual(gridValues(95, 131, 10), [100, 110, 120, 130]);
  assert.deepEqual(gridValues(95, 131, 10, 10), [110, 120, 130]);
  assert.deepEqual(gridValues(-25, 5, 10, 10), [-20, -10]);
  assert.deepEqual(gridValues(1, 2, 0), []);
});

test("containsExtent", () => {
  const outer = squareAround(100, 200, 50);
  assert.ok(containsExtent(outer, squareAround(100, 200, 50)));
  assert.ok(containsExtent(outer, squareAround(110, 190, 20)));
  assert.ok(!containsExtent(outer, squareAround(140, 200, 20)));
});

test("grid spacings print in km from a kilometre, other units as they are", () => {
  assert.equal(formatGridSpacing(0.1, "m"), "0.1 m");
  assert.equal(formatGridSpacing(100, "m"), "100 m");
  assert.equal(formatGridSpacing(1000, "m"), "1 km");
  assert.equal(formatGridSpacing(0.01, "m"), "0.01 m");
  assert.equal(formatGridSpacing(10_000, "m"), "10 km");
  assert.equal(formatGridSpacing(1000, "US ft"), "1,000 US ft");
});

test("the 2D grid is darker and stronger than the 3D one over imagery and the street map", () => {
  assert.deepEqual(gridInk("3d", "satellite"), { ink: GRID_INK, opacity: GRID_OPACITY });
  assert.deepEqual(gridInk("3d", "streets"), { ink: GRID_INK_ON_LIGHT_MAP, opacity: GRID_OPACITY });
  assert.deepEqual(gridInk("2d", "satellite"), { ink: GRID_INK_2D, opacity: GRID_OPACITY_2D });
  assert.deepEqual(gridInk("2d", "streets"), { ink: GRID_INK_2D, opacity: GRID_OPACITY_2D });
  assert.ok(GRID_OPACITY_2D > GRID_OPACITY);
});

test("the 2D grid stays light over the dark map, where dark lines would vanish", () => {
  assert.deepEqual(gridInk("2d", "dark"), { ink: GRID_INK, opacity: GRID_OPACITY_2D });
});
