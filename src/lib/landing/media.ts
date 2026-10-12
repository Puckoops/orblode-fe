import type { Camera } from "./descent.ts";
import { formatNumber } from "./format.ts";
import type { SceneFrame, SiteInfo } from "./site.ts";

/** A still in several widths: `${base}-${width}.avif` and `.webp` for each of `widths`. */
export type Picture = { base: string; width: number; height: number; widths: number[] };

export type Video = { mp4: string; width: number; height: number; frames: number; fps: number };

/** A screen position per video frame, normalised to the frame (0–1), from frame `start` on; null where it is hidden. */
export type Track = { start: number; points: ([number, number] | null)[] };

export type Point3 = [number, number, number];

/** A measurement between two points in site-local metres, and where A and B sit in each turntable frame. */
export type Preset = { name: string; a: Point3; b: Point3; marks: ([number, number, number, number] | null)[] };

export type HeroRendition = { video: Video; poster: Picture; camera: Camera; metresPerPixel: number };

export type DescentRendition = { video: Video; stills: Picture[]; framesPerStage: number; tracks: { survey: Track; pile: Track } };

export type StillName = "relief" | "change" | "swipeBefore" | "swipeAfter" | "profile" | "contoursPipeline" | "contoursMining" | "construction" | "corridor" | "closing";

/** Everything the landing page shows, rendered ahead of time from the showcase survey by `npm run landing:capture`. */
export type LandingMedia = {
  version: 1;
  capturedAt: string;
  surveyId: string;
  site: SiteInfo;
  frame: SceneFrame;
  figures: { zmin: number; zmax: number; interval: number; cell: number; change: { added: number; removed: number; range: number } | null };
  hero: { loop: number; yaw0: number; sway: number; wide: HeroRendition; tall: HeroRendition };
  descent: { stageAltitudes: string[]; wide: DescentRendition; tall: DescentRendition };
  turntable: { frames: number; yaw0: number; step: number; width: number; height: number; photo: string; elevation: string; poster: Picture; presets: Preset[] };
  stills: Record<StillName, Picture | null>;
};

export const DESCENT_STAGES = 3;

/** The descent video frame for stage position `s` (0–3), when each whole stage is `framesPerStage` frames apart. */
export const frameForStage = (s: number, framesPerStage: number) => Math.round(Math.min(Math.max(s, 0), DESCENT_STAGES) * framesPerStage);

/** The media time that shows frame `frame`: its middle, so rounding never lands on a neighbour. */
export const timeForFrame = (frame: number, fps: number) => (frame + 0.5) / fps;

export const frameForTime = (time: number, fps: number) => Math.max(0, Math.floor(time * fps));

export const wrapIndex = (i: number, n: number) => ((Math.round(i) % n) + n) % n;

/** The hero's camera heading at media time `t`: a sway about `yaw0` that ends where it starts. */
export const heroYaw = (t: number, yaw0: number, sway: number, loop: number) => yaw0 + sway * Math.sin((2 * Math.PI * t) / loop);

export const sampleTrack = (track: Track, frame: number) => {
  const i = frame - track.start;
  return i >= 0 && i < track.points.length ? track.points[i] : null;
};

export type Rect = { x: number; y: number; width: number; height: number };

/** Where media of `media`'s size lands in `box` under object-fit: cover, centred. */
export function coverRect(box: { width: number; height: number }, media: { width: number; height: number }): Rect {
  const k = Math.max(box.width / media.width, box.height / media.height), width = media.width * k, height = media.height * k;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

export const coverPoint = (rect: Rect, [nx, ny]: [number, number]): [number, number] => [rect.x + nx * rect.width, rect.y + ny * rect.height];

const SCALES = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** The scale bar for `metresPerPixel`: the first round length at least 70 px long. */
export function scaleBar(metresPerPixel: number) {
  const metres = SCALES.find((m) => m / metresPerPixel >= 70) ?? SCALES[SCALES.length - 1];
  return { metres, px: metres / metresPerPixel };
}

export function measureBetween(a: Point3, b: Point3) {
  const horizontal = Math.hypot(b[0] - a[0], b[1] - a[1]), rise = b[2] - a[2];
  return { distance: Math.hypot(horizontal, rise), horizontal, rise, grade: horizontal > 0.05 ? (Math.abs(rise) / horizontal) * 100 : null };
}

export function formatMeasurement(m: ReturnType<typeof measureBetween>) {
  return {
    distance: `${formatNumber(m.distance, 1)} m`,
    horizontal: `${formatNumber(m.horizontal, 1)} m`,
    height: `${m.rise >= 0 ? "+" : "−"}${formatNumber(Math.abs(m.rise), 1)} m`,
    grade: m.grade === null ? "–" : `${formatNumber(m.grade, 1)}%`,
  };
}

/** Frame indices in an order that covers the whole turn early: 0, the half, the quarters, and so on. */
export function loadOrder(n: number) {
  const seen = new Set<number>(), order: number[] = [];
  for (let parts = 1; order.length < n; parts *= 2) {
    for (let j = 0; j < parts; j++) {
      const i = Math.floor((j * n) / parts);
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
  }
  return order;
}

const fail = (path: string, why: string): never => {
  throw new Error(`landing media: ${path} ${why}`);
};

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function checkPicture(p: unknown, path: string) {
  const pic = p as Picture;
  if (!pic || typeof pic.base !== "string" || !isNumber(pic.width) || !isNumber(pic.height) || !Array.isArray(pic.widths) || !pic.widths.length) fail(path, "is not a picture");
}

function checkVideo(v: unknown, path: string) {
  const video = v as Video;
  if (!video || typeof video.mp4 !== "string" || !isNumber(video.frames) || !isNumber(video.fps)) fail(path, "is not a video");
  if (video.width % 2 || video.height % 2) fail(path, "must have even dimensions for yuv420p");
}

function checkTrack(t: unknown, frames: number, path: string) {
  const track = t as Track;
  if (!track || !isNumber(track.start) || !Array.isArray(track.points)) fail(path, "is not a track");
  if (track.start + track.points.length > frames) fail(path, `runs past the video's ${frames} frames`);
}

/** Checks the manifest's shape and that its tracks and marks line up with the frames they describe. */
export function validateMedia(input: unknown): LandingMedia {
  const m = input as LandingMedia;
  if (!m || m.version !== 1) fail("version", "must be 1");
  if (!m.site || typeof m.site.name !== "string" || m.site.mode !== "survey") fail("site", "must describe a survey");
  if (!m.frame || !isNumber(m.frame.radius)) fail("frame", "is missing");
  for (const key of ["wide", "tall"] as const) {
    const hero = m.hero?.[key];
    if (!hero) fail(`hero.${key}`, "is missing");
    checkVideo(hero.video, `hero.${key}.video`);
    checkPicture(hero.poster, `hero.${key}.poster`);
    const descent = m.descent?.[key];
    if (!descent) fail(`descent.${key}`, "is missing");
    checkVideo(descent.video, `descent.${key}.video`);
    if (descent.video.frames !== DESCENT_STAGES * descent.framesPerStage + 1) fail(`descent.${key}.video.frames`, "must cover stages 0 to 3");
    if (descent.stills.length !== DESCENT_STAGES + 1) fail(`descent.${key}.stills`, "needs one per stage");
    descent.stills.forEach((p, i) => checkPicture(p, `descent.${key}.stills[${i}]`));
    checkTrack(descent.tracks.survey, descent.video.frames, `descent.${key}.tracks.survey`);
    checkTrack(descent.tracks.pile, descent.video.frames, `descent.${key}.tracks.pile`);
  }
  if (m.descent.stageAltitudes?.length !== DESCENT_STAGES + 1) fail("descent.stageAltitudes", "needs one per stage");
  const t = m.turntable;
  if (!t || !isNumber(t.frames) || !t.photo.includes("{i}") || !t.elevation.includes("{i}")) fail("turntable", "needs frame URL patterns with {i}");
  checkPicture(t.poster, "turntable.poster");
  t.presets.forEach((p, i) => {
    if (p.marks.length !== t.frames) fail(`turntable.presets[${i}].marks`, `must have ${t.frames} entries`);
  });
  for (const [name, pic] of Object.entries(m.stills ?? {})) if (pic) checkPicture(pic, `stills.${name}`);
  return m;
}

/** Every file the manifest points at, as paths under public/. */
export function mediaFiles(m: LandingMedia): string[] {
  const pictures: Picture[] = [m.hero.wide.poster, m.hero.tall.poster, m.turntable.poster, ...m.descent.wide.stills, ...m.descent.tall.stills];
  for (const pic of Object.values(m.stills)) if (pic) pictures.push(pic);
  const files = [m.hero.wide.video.mp4, m.hero.tall.video.mp4, m.descent.wide.video.mp4, m.descent.tall.video.mp4];
  for (const pic of pictures) for (const w of pic.widths) files.push(`${pic.base}-${w}.avif`, `${pic.base}-${w}.webp`);
  for (let i = 0; i < m.turntable.frames; i++) files.push(turntableFrame(m.turntable.photo, i), turntableFrame(m.turntable.elevation, i));
  return files;
}

export const turntableFrame = (pattern: string, i: number) => pattern.replace("{i}", String(i).padStart(2, "0"));
