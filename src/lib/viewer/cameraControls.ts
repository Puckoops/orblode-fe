// Camera control maths (FR-03 compass reset, FR-05 orientation widget, FR-06
// projection switch) — pure, no React, no Cesium. Everything here is a function
// of angles, so the tricky parts (shortest-path rotation, the easing curve, the
// compass points' screen projection) are unit-testable without a GPU.
//
// Angle conventions match Cesium's camera:
//   heading  degrees clockwise from true North, 0 ≤ h < 360
//   pitch    degrees from the horizon; NEGATIVE looks down (-90 = straight down)
// and the local frame is East-North-Up (X=East, Y=North, Z=Up).

/** Normalise any angle into [0, 360). */
export function normalizeBearing(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * The signed shortest rotation from one bearing to another, in (-180, 180].
 *
 * This is the whole reason the compass reset isn't just `heading = 0`: a camera
 * sitting at 350° must swing +10° forward, not unwind 350° backwards. Exactly
 * ±180° resolves to +180 so the animation is deterministic rather than
 * direction-dependent on floating-point noise.
 */
export function shortestBearingDelta(from: number, to: number): number {
  const delta = normalizeBearing(to) - normalizeBearing(from);
  if (delta > 180) return delta - 360;
  if (delta <= -180) return delta + 360;
  return delta;
}

/** The PRD's "300ms ease-in-out curve" (§12 FR-03, §13 micro-interactions).
 * Cubic in/out: symmetric, zero velocity at both ends, so the compass settles
 * onto North instead of arriving at speed. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** FR-03's animation duration. */
export const NORTH_RESET_MS = 300;

/**
 * The heading to display at `elapsed` ms into a north reset. Returns the eased
 * interpolation from the starting bearing toward 0°, normalised. At or past the
 * duration it is exactly 0 — the animation must LAND on North, not merely
 * approach it.
 */
export function northResetHeading(startHeading: number, elapsedMs: number): number {
  if (elapsedMs >= NORTH_RESET_MS) return 0;
  const delta = shortestBearingDelta(startHeading, 0);
  return normalizeBearing(startHeading + delta * easeInOutCubic(elapsedMs / NORTH_RESET_MS));
}

/** Whether a reset would visibly do anything. Below a twentieth of a degree the
 * camera is already north-up and re-running the animation just costs frames. */
export function needsNorthReset(heading: number): boolean {
  return Math.abs(shortestBearingDelta(heading, 0)) > 0.05;
}

/** FR-05: fade the widget after 2.0s of camera inactivity… */
export const GIZMO_IDLE_MS = 2000;
/** …down to 20% opacity… */
export const GIZMO_IDLE_OPACITY = 0.2;
/** …over a 500ms transition (§13 micro-interactions). */
export const GIZMO_FADE_MS = 500;

export type Cardinal = "N" | "E" | "S" | "W";

/** One compass point as the camera sees it. */
export interface CardinalMark {
  label: Cardinal;
  /** Unit screen direction from the widget centre. `y` already points DOWN,
   * matching SVG/CSS rather than world Up. */
  x: number;
  y: number;
  /** Along-view component: positive points AWAY from the camera. Drives both
   * the draw order and the near/far brightness that reads as camera tilt. */
  depth: number;
}

const CARDINAL_BEARINGS: { label: Cardinal; bearing: number }[] = [
  { label: "N", bearing: 0 },
  { label: "E", bearing: 90 },
  { label: "S", bearing: 180 },
  { label: "W", bearing: 270 },
];

/**
 * The four compass points as the camera sees them — the orientation widget.
 *
 * Surveyors read a site in cardinal directions, not axis letters, so the widget
 * answers "which way is North on my screen right now?" directly rather than
 * making the reader map X/Y/Z onto the ground first.
 *
 * Derivation: the camera's screen basis in East-North-Up, for heading h and
 * pitch p, is
 *
 *   forward f = ( sin h·cos p,  cos h·cos p,  sin p)
 *   right   r = ( cos h,       -sin h,        0    )
 *   up      u = r × f = (-sin h·sin p, -cos h·sin p, cos p)
 *
 * and a horizontal direction at bearing θ is `v = (sin θ, cos θ, 0)`. Taking
 * `x = v·r`, `y = -(v·u)` (SVG y grows downward) and `depth = v·f` collapses,
 * with `φ = θ - h`, to:
 *
 *   x     =  sin φ                 (screen right)
 *   y     =  sin(pitch)·cos φ      (screen down)
 *   depth =  cos(pitch)·cos φ      (away from the camera)
 *
 * so the four points trace an ellipse that is a circle looking straight down and
 * flattens toward a line as the camera drops to the horizon — the true
 * foreshortening of the ground plane.
 *
 * The RETURNED x/y are that direction NORMALISED to unit length. The widget
 * places its marks at a fixed radius so they are always legible and never slide
 * under the joystick disc at the centre; normalising keeps the exact screen
 * ANGLE (including the way intercardinal directions crowd toward the horizontal
 * as the view flattens) while dropping only the radial foreshortening, which
 * `depth` reports anyway.
 */
export function cardinalMarks(headingDeg: number, pitchDeg: number): CardinalMark[] {
  const h = normalizeBearing(headingDeg);
  const p = (pitchDeg * Math.PI) / 180;
  const sp = Math.sin(p);
  const cp = Math.cos(p);

  return CARDINAL_BEARINGS.map(({ label, bearing }) => {
    const phi = ((bearing - h) * Math.PI) / 180;
    const sPhi = Math.sin(phi);
    const cPhi = Math.cos(phi);

    let x = sPhi;
    let y = sp * cPhi;
    const mag = Math.hypot(x, y);
    if (mag < 1e-6) {
      // Dead edge-on (pitch 0) along the view axis: the point sits exactly at
      // the vanishing point and has no screen direction. Fall back to where a
      // plan view would put it, so the mark stays where the reader expects
      // rather than snapping to an arbitrary angle.
      x = sPhi;
      y = -cPhi;
    } else {
      x /= mag;
      y /= mag;
    }

    return { label, x, y, depth: cp * cPhi };
  });
}

/** Compass points ordered back-to-front, ready to render in sequence so a near
 * mark overlaps a far one. */
export function cardinalMarksByDepth(headingDeg: number, pitchDeg: number): CardinalMark[] {
  return cardinalMarks(headingDeg, pitchDeg).sort((a, b) => b.depth - a.depth);
}

/** 2D draws the site flat and looks straight down on it; 3D draws its relief, mesh and points. */
export type ViewMode = "2d" | "3d";

export const TOP_DOWN_PITCH_DEG = -90;

/** The oblique pitch to restore when returning to 3D. Clamped into the
 * joystick's own usable band (-89°…-8°) so returning to 3D can never land the
 * camera underground or gimbal-flipped. */
export function restorePitch(storedPitchDeg: number | null): number {
  const fallback = -45;
  const p = storedPitchDeg ?? fallback;
  if (!Number.isFinite(p)) return fallback;
  // A stored pitch that is already (near) top-down gives a 3D view identical to
  // the 2D one just left, which reads as "the toggle did nothing".
  if (p < -89 || p > -8 || p <= -88) return fallback;
  return p;
}
