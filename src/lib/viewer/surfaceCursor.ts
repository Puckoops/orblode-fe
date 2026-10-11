import type { Vec3 } from "./interaction/types.ts";

// The mark's proportions (app/icon.svg): ring radius 26, line 50 past the centre, dot radius 5.
export const CURSOR_RING_PX = 15;
export const CURSOR_STEM_PX = 29;
export const CURSOR_DOT_PX = 3;

const RING_SEGMENTS = 48;
const SETTLED_COS = Math.cos((0.5 * Math.PI) / 180);

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

function normalize(a: Vec3): Vec3 | null {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : null;
}

/** Unit normal of the plane through a, b and c on the side `toward` points to; null when the points are (nearly) collinear. */
export function planeNormal(a: Vec3, b: Vec3, c: Vec3, toward: Vec3): Vec3 | null {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const n = cross(ab, ac);
  if (length(n) <= 1e-6 * length(ab) * length(ac)) return null;
  const unit = normalize(n)!;
  return dot(unit, toward) < 0 ? scale(unit, -1) : unit;
}

/** One easing step from `current` toward `target`, settling within half a degree. */
export function easeNormal(
  current: Vec3 | null,
  target: Vec3,
  rate = 0.35
): { normal: Vec3; settled: boolean } {
  const cos = current ? dot(current, target) : 1;
  if (!current || cos >= SETTLED_COS || cos < -0.5) return { normal: target, settled: true };
  const blended = normalize(add(current, scale(sub(target, current), rate)));
  return blended ? { normal: blended, settled: false } : { normal: target, settled: true };
}

export interface MarkGeometry {
  ring: Vec3[];
  stemStart: Vec3;
  stemTip: Vec3;
}

/** The mark laid on a surface: the ring flat on it, the line along its normal. Sizes are screen pixels. */
export function markGeometry(center: Vec3, normal: Vec3, metresPerPx: number): MarkGeometry {
  const radius = CURSOR_RING_PX * metresPerPx;
  const helper = Math.abs(normal.x) < 0.9 ? vec(1, 0, 0) : vec(0, 1, 0);
  const u = normalize(cross(helper, normal))!;
  const w = cross(normal, u);
  const ring: Vec3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const t = (2 * Math.PI * i) / RING_SEGMENTS;
    ring.push(add(center, add(scale(u, radius * Math.cos(t)), scale(w, radius * Math.sin(t)))));
  }
  return {
    ring,
    // As in the mark, the line passes through the whole ring, so it starts a radius below the surface.
    stemStart: sub(center, scale(normal, radius)),
    stemTip: add(center, scale(normal, CURSOR_STEM_PX * metresPerPx)),
  };
}
