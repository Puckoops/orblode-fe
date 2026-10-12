import { test } from "node:test";
import assert from "node:assert/strict";

import { chainageMarks, contourSegments, cutFillColour } from "../maps.ts";

test("contourSegments crosses a sloping cell where the level falls", () => {
  const grid = Float32Array.from([0.5, 3.5, 0.5, 3.5]);
  const { minor, major } = contourSegments(grid, 2, 2, 1, 2);
  assert.equal(minor.length / 4, 2);
  assert.equal(major.length / 4, 1);
  const [x1, y1, x2, y2] = major;
  assert.ok(Math.abs(x1 - 0.5) < 1e-6 && Math.abs(x2 - 0.5) < 1e-6, "level 2 sits halfway across");
  assert.deepEqual([Math.min(y1, y2), Math.max(y1, y2)], [0, 1]);
});

test("contourSegments draws nothing across flat ground", () => {
  const { minor, major } = contourSegments(Float32Array.from([3.5, 3.5, 3.5, 3.5]), 2, 2, 1, 5);
  assert.equal(minor.length + major.length, 0);
});

test("chainageMarks spaces marks along the line and points normals to its left", () => {
  const marks = chainageMarks([[0, 0], [60, 0], [60, 60]], 50);
  assert.deepEqual(marks.map((m) => m.distance), [0, 50, 100]);
  assert.deepEqual([marks[1].x, marks[1].y], [50, 0]);
  assert.deepEqual([marks[1].normalX, marks[1].normalY], [-0, 1]);
  assert.deepEqual([marks[2].x, marks[2].y], [60, 40]);
});

test("cutFillColour is neutral on grade and diverges by sign", () => {
  const level = cutFillColour(0, [0, 0, 0]);
  const cut = cutFillColour(3, [0, 0, 0]);
  const fill = cutFillColour(-3, [0, 0, 0]);
  assert.deepEqual(level, [44, 39, 34]);
  assert.ok(cut[2] > cut[0], "cut runs blue");
  assert.ok(fill[0] > fill[2], "fill runs copper");
});
