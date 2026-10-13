import { spawnSync } from "node:child_process";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CACHE = path.join(ROOT, ".landing-capture");

/** The hero loops a sway about its old starting heading: 12 s at 24 fps, about the old orbit's speed on average. */
export const HERO = { loop: 12, fps: 24, yaw0: 0.5, sway: 0.11 } as const;
/** About 7 px of scroll per frame on a 720 px screen; more frames cost bytes without looking smoother. */
export const DESCENT = { fps: 30, framesPerStage: { wide: 60, tall: 40 } } as const;
export const TURNTABLE = { frames: 72, yaw0: 0.9, step: (5 * Math.PI) / 180, width: 1280, height: 720 } as const;

/** CSS size and device scale of each pass; the canvas backing store is their product. */
export const PASSES = {
  heroWide: { css: [1280, 720], scale: 1 },
  heroTall: { css: [400, 720], scale: 1.25 },
  descentWide: { css: [1280, 720], scale: 1 },
  descentTall: { css: [400, 864], scale: 1.25 },
  turntable: { css: [TURNTABLE.width, TURNTABLE.height], scale: 1 },
} as const;

export const heroYaw = (frame: number) => HERO.yaw0 + HERO.sway * Math.sin((2 * Math.PI * frame) / (HERO.loop * HERO.fps));

export const frameName = (i: number, digits = 4) => `${String(i).padStart(digits, "0")}.png`;

export type Normalised = [number, number] | null;
export type Point3 = [number, number, number];

/** What capture.ts leaves beside the frames for encode.ts. */
export type CaptureRecord = {
  capturedAt: string;
  renderer: { commit: string; chrome: string };
  info: {
    site: { name: string; mode: string } & Record<string, unknown>;
    surveyId: string;
    frame: Record<string, unknown>;
    figures: Record<string, unknown>;
    stageAltitudes: string[];
    presets: { name: string; a: Point3; b: Point3 }[];
  };
  hero: Record<"wide" | "tall", { width: number; height: number; camera: Record<string, number>; metresPerPixel: number }>;
  descent: Record<"wide" | "tall", { width: number; height: number; framesPerStage: number; tracks: { survey: Track; pile: Track } }>;
  turntable: { width: number; height: number; marks: ([number, number, number, number] | null)[][] };
  stills: string[];
};

export type Track = { start: number; points: Normalised[] };

const round = (v: number) => Math.round(v * 1e4) / 1e4;

export const roundPoint = (p: Normalised): Normalised => (p ? [round(p[0]), round(p[1])] : null);

/** A per-frame track trimmed to the frames where it shows. */
export function trackOf(points: Normalised[]): Track {
  const first = points.findIndex(Boolean);
  if (first < 0) return { start: 0, points: [] };
  let last = points.length - 1;
  while (!points[last]) last--;
  return { start: first, points: points.slice(first, last + 1).map(roundPoint) };
}

/** Runs a command to completion and returns its stdout and stderr; throws with them when it fails. */
export function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return `${result.stdout}${result.stderr}`;
}

export const gitCommit = () => run("git", ["rev-parse", "--short", "HEAD"]).trim();
