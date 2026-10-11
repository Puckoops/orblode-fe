import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GRID_FADE_PX,
  containsExtent,
  edgeCrossings,
  formatGridSpacing,
  formatGridValue,
  gridLevel,
  gridValues,
  labelStep,
  minorOpacity,
  spreadAlong,
  squareAround,
  visibleSpacing,
} from "../grid.ts";

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

test("labelStep keeps labels on round multiples at least the gap apart", () => {
  assert.equal(labelStep(100, 100 / 120, 96), 100);
  assert.equal(labelStep(100, 100 / 19, 96), 1000);
  assert.equal(labelStep(100, 100 / 19, 24), 200);
  assert.equal(labelStep(10, 10 / 30, 96), 50);
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

test("edgeCrossings interpolates where each multiple crosses the edge", () => {
  const crossings = edgeCrossings(
    [
      { at: 0, value: 95, other: 500 },
      { at: 100, value: 125, other: 530 },
      null,
      { at: 300, value: 140, other: 540 },
    ],
    10
  );
  assert.equal(crossings.length, 3);
  assert.deepEqual(
    crossings.map((c) => c.value),
    [100, 110, 120]
  );
  near(crossings[0].at, 100 / 6);
  near(crossings[0].other, 505);
  near(crossings[2].at, 250 / 3);
});

test("edgeCrossings handles a decreasing edge and skips runaway gaps", () => {
  const down = edgeCrossings(
    [
      { at: 0, value: 30, other: 0 },
      { at: 10, value: 10, other: 0 },
    ],
    10
  );
  assert.deepEqual(
    down.map((c) => [c.value, c.at]),
    [
      [20, 5],
      [30, 0],
    ]
  );
  const runaway = edgeCrossings(
    [
      { at: 0, value: 0, other: 0 },
      { at: 1, value: 10_000, other: 0 },
    ],
    10
  );
  assert.deepEqual(runaway, []);
});

test("edgeCrossings ignores an axis that only jitters along the edge", () => {
  const jitter = [
    { at: 0, value: 98, other: 0 },
    { at: 48, value: 103, other: 5 },
    { at: 96, value: 97, other: 10 },
    { at: 144, value: 99, other: 15 },
  ];
  assert.deepEqual(edgeCrossings(jitter, 10), []);
});

test("edgeCrossings leaves a line that runs along the edge unlabelled", () => {
  const along = [
    { at: 0, value: 95, other: 0 },
    { at: 48, value: 105, other: 100 },
  ];
  assert.deepEqual(edgeCrossings(along, 10), []);
  assert.equal(edgeCrossings(along, 10, { minSlope: 0 }).length, 1);
});

test("spreadAlong drops items closer than the gap", () => {
  const kept = spreadAlong([{ at: 50 }, { at: 0 }, { at: 30 }, { at: 90 }], 40);
  assert.deepEqual(
    kept.map((k) => k.at),
    [0, 50, 90]
  );
});

test("grid values print with the decimals their spacing needs", () => {
  assert.equal(formatGridValue(6812400, 100), "6,812,400");
  assert.equal(formatGridValue(512300.3, 0.1), "512,300.3");
  assert.equal(formatGridValue(-0, 10), "0");
});

test("grid spacings print in km from a kilometre, other units as they are", () => {
  assert.equal(formatGridSpacing(0.1, "m"), "0.1 m");
  assert.equal(formatGridSpacing(100, "m"), "100 m");
  assert.equal(formatGridSpacing(1000, "m"), "1 km");
  assert.equal(formatGridSpacing(1000, "US ft"), "1,000 US ft");
});
