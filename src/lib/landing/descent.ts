import { formatNumber } from "./format.ts";
import { clamp, lerp, smoothstep } from "./math.ts";
import type { SceneFrame } from "./site.ts";

export type Camera = { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number; fov: number };

/**
 * The descent's stages. A stage position `s` runs from 0 (the globe) to 3 (the featured
 * measurement); whole numbers are the stages themselves and fractions are the moves between them.
 */
export const STAGES = ["Portfolio", "Site", "Twin", "Measure"] as const;

export type Pose = Omit<Camera, "fov">;

/** The poses after the globe, sized to the scene: the site straight down, the twin at an angle, then the featured measurement close up. */
export function posesFor(frame: SceneFrame): Pose[] {
  const focus = frame.focus ?? { x: frame.cx, y: frame.cy, z: frame.ground, reach: frame.radius * 0.15 };
  return [
    { tx: frame.cx, ty: frame.cy, tz: frame.ground, yaw: 0, pitch: Math.PI / 2 - 0.002, dist: frame.radius * 3.5 },
    { tx: frame.cx, ty: frame.cy, tz: frame.low, yaw: 0.65, pitch: 0.62, dist: frame.radius * 1.26 },
    { tx: focus.x, ty: focus.y, tz: focus.z, yaw: 2.35, pitch: 0.8, dist: clamp(focus.reach * 6, frame.radius * 0.3, frame.radius * 0.9) },
  ];
}

const PROGRESS_KNOTS = [0, 0.13, 0.27, 0.41, 0.55, 0.69, 0.83, 1];
const STAGE_KNOTS = [0, 0, 1, 1, 2, 2, 3, 3];

/** Scroll progress through the section (0–1) to a stage position: each stage holds, then eases into the next. */
export function stageAt(progress: number) {
  const p = clamp(progress, 0, 1);
  for (let i = 1; i < PROGRESS_KNOTS.length; i++) {
    if (p <= PROGRESS_KNOTS[i]) return lerp(STAGE_KNOTS[i - 1], STAGE_KNOTS[i], smoothstep(PROGRESS_KNOTS[i - 1], PROGRESS_KNOTS[i], p));
  }
  return 3;
}

/** The scroll progress each stage's tab covers, and where its tab button scrolls to. */
export const TAB_RANGES: readonly (readonly [number, number])[] = [[0, 0.2], [0.2, 0.48], [0.48, 0.76], [0.76, 1]];
export const TAB_ANCHORS: readonly number[] = [0.06, 0.34, 0.62, 0.92];

export const globeOpacity = (s: number) => 1 - smoothstep(0.78, 1, s);
export const siteOpacity = (s: number) => smoothstep(0.7, 1, s);
export const elevationMix = (s: number) => smoothstep(1.45, 1.85, s) * (1 - smoothstep(2.3, 2.7, s));
/** How far stage `stage`'s overlays are faded in when the descent is at `s`. */
export const nearStage = (s: number, stage: number, width = 2.4) => 1 - clamp(Math.abs(s - stage) * width, 0, 1);

/**
 * Places `cam` for stage position `s`. Up to s = 1 it holds the site pose, pulled back while the
 * globe is still on screen. With `motion`, the twin and measure stages drift slowly over `time`.
 */
export function cameraAt(s: number, time: number, motion: boolean, poses: readonly Pose[], cam: Camera) {
  if (s <= 1) {
    Object.assign(cam, poses[0]);
    cam.dist = poses[0].dist * lerp(3.5, 1, siteOpacity(s));
    return cam;
  }
  const i = Math.min(Math.floor(s), 2), f = Math.min(s - i, 1), a = poses[i - 1], b = poses[i];
  cam.tx = lerp(a.tx, b.tx, f);
  cam.ty = lerp(a.ty, b.ty, f);
  cam.tz = lerp(a.tz, b.tz, f);
  cam.yaw = lerp(a.yaw, b.yaw, f);
  cam.pitch = lerp(a.pitch, b.pitch, f);
  cam.dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), f));
  if (motion) cam.yaw += Math.sin(time * 0.13) * 0.12 * (nearStage(s, 2, 3) + nearStage(s, 3, 3) * 0.6);
  return cam;
}

/** On a phone the copy covers the top of the window, so the camera looks further ahead to set the subject lower. */
export function lookAheadOnNarrow(cam: Camera, s: number) {
  const ahead = ((cam.dist * Math.tan(cam.fov / 2)) / Math.sin(cam.pitch)) * 0.35 * siteOpacity(s);
  cam.tx += Math.sin(cam.yaw) * ahead;
  cam.ty += Math.cos(cam.yaw) * ahead;
  return cam;
}

/** Where the camera sits: `dist` back from its target along a heading of `yaw` (clockwise from north), `pitch` below level. */
export function eyeOf(cam: Camera): [number, number, number] {
  const level = Math.cos(cam.pitch);
  return [cam.tx - cam.dist * level * Math.sin(cam.yaw), cam.ty - cam.dist * level * Math.cos(cam.yaw), cam.tz + cam.dist * Math.sin(cam.pitch)];
}

export const altitudeOf = (cam: Camera, ground: number) => eyeOf(cam)[2] - ground;

export const GLOBE_ALTITUDE = 2e7;
const LOWEST_ALTITUDE = 20;

const HANDOVER = 0.72;

/** Height shown on the altimeter: eased down from orbit over the globe, then the camera's own height above the ground. */
export function altitudeAt(s: number, cam: Camera, poses: readonly Pose[], ground: number) {
  if (s >= HANDOVER) return altitudeOf(cam, ground);
  const handover = poses[0].dist * lerp(3.5, 1, siteOpacity(HANDOVER)) + poses[0].tz - ground;
  return Math.exp(lerp(Math.log(GLOBE_ALTITUDE), Math.log(handover), smoothstep(0.04, HANDOVER, s)));
}

/** Where an altitude sits on the altimeter's log scale: 0 at the top (orbit), 1 at the bottom. */
export const altitudeFraction = (altitude: number) =>
  clamp((Math.log10(GLOBE_ALTITUDE) - Math.log10(Math.max(altitude, 1))) / (Math.log10(GLOBE_ALTITUDE) - Math.log10(LOWEST_ALTITUDE)), 0, 1);

export const formatAltitude = (altitude: number) =>
  altitude >= 10_000
    ? `${formatNumber(altitude / 1000)} km`
    : altitude >= 1000
      ? `${formatNumber(altitude / 1000, 1)} km`
      : `${formatNumber(altitude)} m`;

export const ALTIMETER_TICKS: readonly (readonly [number, string])[] = [
  [2e7, "20,000 km"],
  [1e6, "1,000 km"],
  [1e5, "100 km"],
  [1e4, "10 km"],
  [1e3, "1 km"],
  [100, "100 m"],
  [20, "20 m"],
];

/** The altimeter reading at each stage's hold, for the tab labels. */
export function stageAltitudes(poses: readonly Pose[], ground: number) {
  const cam: Camera = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 0, fov: 0.82 };
  return STAGES.map((_, stage) => formatAltitude(stage === 0 ? GLOBE_ALTITUDE : altitudeOf(cameraAt(stage, 0, false, poses, cam), ground)));
}
