import { test } from "node:test";
import assert from "node:assert/strict";
import { Cartesian3, Cartographic, Math as CesiumMath, Rectangle } from "cesium";

import { drawnHeight, framingSpots, highestSurface, raiseOverGround } from "../framing.ts";

const line = (n: number) => Array.from({ length: n }, (_, i) => Cartesian3.fromDegrees(77.6 + i * 1e-5, 12.9, 0));

test("framingSpots reads the frame's middle first, then the shape's vertices", () => {
  const rect = Rectangle.fromDegrees(77.5, 12.8, 77.7, 13.0);
  const spots = framingSpots(rect, line(3));
  assert.equal(spots.length, 4);
  assert.ok(Math.abs(CesiumMath.toDegrees(spots[0].longitude) - 77.6) < 1e-9);
  assert.ok(Math.abs(CesiumMath.toDegrees(spots[0].latitude) - 12.9) < 1e-9);
  assert.ok(Math.abs(CesiumMath.toDegrees(spots[3].longitude) - 77.60002) < 1e-9);
});

test("framingSpots thins a long line to the limit, keeping its first vertex", () => {
  const rect = Rectangle.fromDegrees(77.5, 12.8, 77.7, 13.0);
  for (const n of [11, 12, 100, 1001]) {
    const spots = framingSpots(rect, line(n), 12);
    assert.ok(spots.length <= 12, `${n} vertices gave ${spots.length} spots`);
    assert.ok(spots.length >= 7, `${n} vertices gave only ${spots.length} spots`);
    assert.ok(Math.abs(CesiumMath.toDegrees(spots[1].longitude) - 77.6) < 1e-9);
  }
});

test("highestSurface skips unknown and non-finite heights", () => {
  assert.equal(highestSurface([undefined, 151.2, Number.NaN, 148, Infinity]), 151.2);
  assert.equal(highestSurface([-42, undefined, -60]), -42);
  assert.equal(highestSurface([undefined, Number.NaN]), undefined);
  assert.equal(highestSurface([]), undefined);
});

test("drawnHeight is the true height at ×1 and squashes towards the relative height", () => {
  assert.equal(drawnHeight(150, 1, 0), 150);
  assert.equal(drawnHeight(150, 2, 0), 300);
  assert.ok(Math.abs(drawnHeight(170, 0.01, 150) - 150.2) < 1e-9);
  assert.equal(drawnHeight(130, 3, 150), 90);
});

test("raiseOverGround keeps the plan position and adds the ground to the height", () => {
  const framed = Cartesian3.fromDegrees(77.6, 12.9, 143);
  const raised = Cartographic.fromCartesian(raiseOverGround(framed, 150));
  assert.ok(Math.abs(CesiumMath.toDegrees(raised.longitude) - 77.6) < 1e-9);
  assert.ok(Math.abs(CesiumMath.toDegrees(raised.latitude) - 12.9) < 1e-9);
  assert.ok(Math.abs(raised.height - 293) < 1e-6);

  const belowEllipsoid = Cartographic.fromCartesian(raiseOverGround(framed, -40));
  assert.ok(Math.abs(belowEllipsoid.height - 103) < 1e-6);
});
