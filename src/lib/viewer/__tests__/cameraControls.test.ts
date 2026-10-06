import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GIZMO_IDLE_OPACITY,
  NORTH_RESET_MS,
  TOP_DOWN_PITCH_DEG,
  cardinalMarks,
  cardinalMarksByDepth,
  easeInOutCubic,
  needsNorthReset,
  normalizeBearing,
  northResetHeading,
  restorePitch,
  shortestBearingDelta,
} from "../cameraControls.ts";

const near = (a: number, b: number, tol = 1e-9) =>
  assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test("normalizeBearing folds any angle into [0, 360)", () => {
  assert.equal(normalizeBearing(0), 0);
  assert.equal(normalizeBearing(360), 0);
  assert.equal(normalizeBearing(370), 10);
  assert.equal(normalizeBearing(-10), 350);
  assert.equal(normalizeBearing(-370), 350);
  assert.equal(normalizeBearing(NaN), 0);
});

test("shortestBearingDelta takes the short way round", () => {
  // The reason the reset isn't `heading = 0`: from 350° the camera swings
  // +10° forward rather than unwinding 350° backwards.
  assert.equal(shortestBearingDelta(350, 0), 10);
  assert.equal(shortestBearingDelta(10, 0), -10);
  assert.equal(shortestBearingDelta(0, 0), 0);
  assert.equal(shortestBearingDelta(90, 0), -90);
  assert.equal(shortestBearingDelta(270, 0), 90);
});

test("shortestBearingDelta resolves the ±180 tie deterministically", () => {
  // Either direction is equally short; picking one keeps the animation from
  // flipping direction on floating-point noise.
  assert.equal(shortestBearingDelta(180, 0), 180);
  assert.equal(shortestBearingDelta(0, 180), 180);
});

test("shortestBearingDelta always lands inside (-180, 180]", () => {
  for (let from = 0; from < 360; from += 7) {
    for (let to = 0; to < 360; to += 11) {
      const d = shortestBearingDelta(from, to);
      assert.ok(d > -180 && d <= 180, `delta ${d} out of range (${from}→${to})`);
      // Applying the delta must actually arrive at the target.
      near(normalizeBearing(from + d), normalizeBearing(to), 1e-9);
    }
  }
});

test("easeInOutCubic is a clamped, symmetric 0→1 curve", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  near(easeInOutCubic(0.5), 0.5);
  // Clamped rather than extrapolating past the endpoints.
  assert.equal(easeInOutCubic(-1), 0);
  assert.equal(easeInOutCubic(2), 1);
  // Symmetric about the midpoint: f(t) + f(1-t) === 1.
  for (const t of [0.1, 0.25, 0.4, 0.75]) {
    near(easeInOutCubic(t) + easeInOutCubic(1 - t), 1, 1e-12);
  }
  // Monotonic — a compass that backtracks mid-swing would look broken.
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = easeInOutCubic(t);
    assert.ok(v >= prev, `not monotonic at ${t}`);
    prev = v;
  }
});

test("northResetHeading starts where it was and lands exactly on North", () => {
  near(northResetHeading(350, 0), 350);
  // Must be EXACTLY 0 at the end — "almost north" leaves a visible tilt.
  assert.equal(northResetHeading(350, NORTH_RESET_MS), 0);
  assert.equal(northResetHeading(350, NORTH_RESET_MS + 100), 0);
});

test("northResetHeading sweeps forward from 350° rather than unwinding", () => {
  // Mid-flight the heading must be in (350, 360) ∪ {0..10} — never near 180.
  const mid = northResetHeading(350, NORTH_RESET_MS / 2);
  const delta = shortestBearingDelta(350, mid);
  assert.ok(delta > 0 && delta < 10, `mid heading ${mid} took the long way`);
});

test("northResetHeading progresses monotonically toward North", () => {
  let prevRemaining = Infinity;
  for (let t = 0; t <= NORTH_RESET_MS; t += 25) {
    const remaining = Math.abs(shortestBearingDelta(northResetHeading(120, t), 0));
    assert.ok(remaining <= prevRemaining + 1e-9, `regressed at ${t}ms`);
    prevRemaining = remaining;
  }
  assert.equal(prevRemaining, 0);
});

test("needsNorthReset ignores a camera already at North", () => {
  assert.equal(needsNorthReset(0), false);
  assert.equal(needsNorthReset(0.01), false);
  assert.equal(needsNorthReset(359.99), false);
  assert.equal(needsNorthReset(1), true);
  assert.equal(needsNorthReset(180), true);
});

/** Look up one cardinal from an unordered result. */
const mark = (marks: ReturnType<typeof cardinalMarks>, label: string) => {
  const m = marks.find((x) => x.label === label);
  assert.ok(m, `no ${label} mark`);
  return m;
};

test("cardinalMarks: a north-up plan view puts N up, E right, S down, W left", () => {
  const m = cardinalMarks(0, TOP_DOWN_PITCH_DEG);
  near(mark(m, "N").x, 0);
  near(mark(m, "N").y, -1); // screen UP is negative y
  near(mark(m, "E").x, 1);
  near(mark(m, "E").y, 0);
  near(mark(m, "S").x, 0);
  near(mark(m, "S").y, 1);
  near(mark(m, "W").x, -1);
  near(mark(m, "W").y, 0);
});

test("cardinalMarks: facing East swings North to the left of the screen", () => {
  const m = cardinalMarks(90, TOP_DOWN_PITCH_DEG);
  near(mark(m, "N").x, -1);
  near(mark(m, "N").y, 0);
  near(mark(m, "E").x, 0);
  near(mark(m, "E").y, -1); // the direction you face is at the top
});

test("cardinalMarks: facing South flips East to the left", () => {
  const m = cardinalMarks(180, TOP_DOWN_PITCH_DEG);
  near(mark(m, "E").x, -1);
  near(mark(m, "W").x, 1);
  near(mark(m, "S").y, -1);
  near(mark(m, "N").y, 1);
});

test("cardinalMarks: the point you face is nearest, its opposite is farthest", () => {
  // depth = cos(pitch)·cos(φ): positive is AWAY. Facing north on an oblique
  // view, N is ahead of the camera (far) and S is behind the pivot (near).
  const m = cardinalMarks(0, -45);
  assert.ok(mark(m, "N").depth > 0, "N should be the far point when facing north");
  assert.ok(mark(m, "S").depth < 0, "S should be the near point when facing north");
  // The two perpendicular points sit level with the camera.
  near(mark(m, "E").depth, 0, 1e-9);
  near(mark(m, "W").depth, 0, 1e-9);
});

test("cardinalMarks: a plan view has no near or far point", () => {
  // Looking straight down, all four are equidistant — nothing should dim.
  for (const m of cardinalMarks(37, TOP_DOWN_PITCH_DEG)) {
    near(m.depth, 0, 1e-9);
  }
});

test("cardinalMarks: marks stay on the unit circle at every camera angle", () => {
  // The widget places them at a fixed radius, so a non-unit result would push a
  // mark off the ring or under the joystick disc.
  for (let h = 0; h < 360; h += 13) {
    for (let p = -90; p <= 0; p += 6) {
      for (const m of cardinalMarks(h, p)) {
        near(Math.hypot(m.x, m.y), 1, 1e-9);
        assert.ok(Number.isFinite(m.depth));
      }
    }
  }
});

test("cardinalMarks: opposite points always sit opposite on screen", () => {
  for (let h = 0; h < 360; h += 29) {
    for (const p of [-90, -60, -30, -8]) {
      const m = cardinalMarks(h, p);
      near(mark(m, "N").x, -mark(m, "S").x, 1e-9);
      near(mark(m, "N").y, -mark(m, "S").y, 1e-9);
      near(mark(m, "E").x, -mark(m, "W").x, 1e-9);
      near(mark(m, "E").y, -mark(m, "W").y, 1e-9);
    }
  }
});

test("cardinalMarks: flattening the view crowds the marks toward the horizontal", () => {
  // The ground plane foreshortens as the camera drops toward the horizon, so a
  // point 45° off the view axis reads closer to screen-horizontal. That
  // squashing is the tilt cue the widget keeps after normalising.
  const steep = mark(cardinalMarks(45, -80), "N"); // 45° off the view axis
  const shallow = mark(cardinalMarks(45, -20), "N");
  assert.ok(
    Math.abs(shallow.y) < Math.abs(steep.y),
    `expected the shallow view to flatten N toward horizontal (${shallow.y} vs ${steep.y})`
  );
});

test("cardinalMarks: an edge-on view still places every point", () => {
  // At pitch 0 the ground plane is a line and the on-axis points land exactly on
  // the vanishing point — they must fall back to a sane spot, not NaN.
  for (const m of cardinalMarks(0, 0)) {
    assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y), `${m.label} is not finite`);
    near(Math.hypot(m.x, m.y), 1, 1e-9);
  }
  near(mark(cardinalMarks(0, 0), "N").y, -1);
  near(mark(cardinalMarks(0, 0), "S").y, 1);
});

test("cardinalMarksByDepth orders far marks first so near ones draw over them", () => {
  const ordered = cardinalMarksByDepth(35, -40);
  assert.equal(ordered.length, 4);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i - 1].depth >= ordered[i].depth, "not back-to-front");
  }
});

test("compass idle constants match the PRD", () => {
  assert.equal(GIZMO_IDLE_OPACITY, 0.2); // "fade to 20% opacity"
});

test("restorePitch returns a usable oblique angle", () => {
  assert.equal(restorePitch(-45), -45);
  assert.equal(restorePitch(-30), -30);
});

test("restorePitch rejects angles that would make the toggle a no-op", () => {
  // Restoring to (near) top-down would give a 3D view identical to the 2D one
  // just left — the button would look broken.
  assert.equal(restorePitch(-90), -45);
  assert.equal(restorePitch(-88.5), -45);
  // Out of the joystick's usable band, or simply unknown.
  assert.equal(restorePitch(-5), -45);
  assert.equal(restorePitch(null), -45);
  assert.equal(restorePitch(NaN), -45);
});
