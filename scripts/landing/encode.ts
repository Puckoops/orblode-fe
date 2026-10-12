// Turns the last capture (.landing-capture/<survey id>/) into the landing's media: H.264 videos for the
// hero and the descent, AVIF turntable frames, AVIF and WebP stills, all in public/landing/<slug>-<hash>/,
// and src/lib/landing/media.json describing them. Fails when a video drops frames, its quality falls
// under the VMAF floor, or a file goes over its size budget.
//
//   npm run landing:encode            # SKIP_VMAF=1 skips the quality check
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { type HeroRendition, type DescentRendition, type LandingMedia, type Picture, type StillName, mediaFiles, validateMedia } from "../../src/lib/landing/media.ts";
import { CACHE, DESCENT, HERO, ROOT, TURNTABLE, frameName, run, type CaptureRecord } from "./lib.ts";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";
const PUBLIC = path.join(ROOT, "public");
const LANDING = path.join(PUBLIC, "landing");
const MANIFEST = path.join(ROOT, "src/lib/landing/media.json");

const KB = 1024, MB = 1024 * KB;
const BUDGET = {
  heroWide: 1.8 * MB,
  heroTall: 1 * MB,
  descentWide: 4 * MB,
  descentTall: 1.6 * MB,
  turntableSet: 3.5 * MB,
  stillsTotal: 0.7 * MB,
  folder: 18 * MB,
};
// Point clouds are all edges, so H.264 needs far more bits for them than for film; these floors keep
// the hero (behind a scrim and copy) and the descent clean at the sizes above.
const VMAF_FLOOR = { hero: 84, descent: 88 };

const COLOUR = ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"];
const X264 = ["-c:v", "libx264", "-preset", "veryslow", "-profile:v", "high", "-level:v", "4.1", "-an", "-movflags", "+faststart"];

const problems: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};

function encodeVideo(frames: string, fps: number, out: string, kind: "hero" | "descent") {
  const gop =
    kind === "hero"
      ? ["-crf", "28", "-g", String(HERO.loop * HERO.fps), "-bf", "3", "-x264-params", "aq-mode=3"]
      : ["-crf", "26", "-g", "20", "-keyint_min", "20", "-sc_threshold", "0", "-bf", "0", "-x264-params", "aq-mode=3:open-gop=0"];
  run(FFMPEG, ["-y", "-v", "error", "-framerate", String(fps), "-i", path.join(frames, "%04d.png"), ...COLOUR, ...X264, ...gop, out]);
}

const frameCount = (file: string) =>
  Number(run(FFPROBE, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).trim());

function vmaf(file: string, frames: string, fps: number) {
  const output = run(FFMPEG, [
    "-v", "info", "-i", file, "-framerate", String(fps), "-i", path.join(frames, "%04d.png"),
    "-lavfi", "[0:v]setpts=PTS-STARTPTS[d];[1:v]format=yuv420p,setpts=PTS-STARTPTS[r];[d][r]libvmaf=n_subsample=6", "-f", "null", "-",
  ]);
  const score = output.match(/VMAF score: ([\d.]+)/)?.[1];
  if (!score) throw new Error(`no VMAF score for ${file}`);
  return Number(score);
}

const size = async (file: string) => (await stat(file)).size;
const mb = (bytes: number) => `${(bytes / MB).toFixed(2)} MB`;

/** Writes `${base}-${w}.avif|webp` for each width; returns the manifest entry with `base` as a public URL. */
async function picture(input: string, outDir: string, name: string, urlDir: string, widths: number[], lineArt: boolean): Promise<Picture> {
  const meta = await sharp(input).metadata();
  const width = meta.width!, height = meta.height!;
  const used = [...new Set(widths.map((w) => Math.min(w, width)))].sort((a, b) => a - b);
  for (const w of used) {
    const resized = () => sharp(input).resize({ width: w });
    await resized().avif({ quality: lineArt ? 60 : 50, effort: 6 }).toFile(path.join(outDir, `${name}-${w}.avif`));
    await resized().webp({ quality: lineArt ? 80 : 72, effort: 6 }).toFile(path.join(outDir, `${name}-${w}.webp`));
  }
  return { base: `${urlDir}/${name}`, width, height, widths: used };
}

async function hashDir(dir: string) {
  const hash = createHash("sha256");
  const walk = async (d: string): Promise<string[]> =>
    (await Promise.all((await readdir(d, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])))).flat();
  for (const file of (await walk(dir)).sort()) {
    hash.update(path.relative(dir, file));
    hash.update(await readFile(file));
  }
  return hash.digest("hex").slice(0, 8);
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";

const LINE_ART: StillName[] = ["profile", "contoursPipeline", "contoursMining", "construction", "corridor", "closing"];

async function main() {
  const surveyId = (await readFile(path.join(CACHE, "latest"), "utf8")).trim();
  const src = path.join(CACHE, surveyId);
  const record = JSON.parse(await readFile(path.join(src, "capture.json"), "utf8")) as CaptureRecord;
  const slug = slugOf(record.info.site.name);
  const work = path.join(src, "out");
  const urlDir = "/landing/__DIR__";
  await rm(work, { recursive: true, force: true });
  await mkdir(path.join(work, "try/photo"), { recursive: true });
  await mkdir(path.join(work, "try/elevation"), { recursive: true });
  console.log(`Encoding ${record.info.site.name} (${surveyId}), captured ${record.capturedAt}`);

  const heroFrames = HERO.loop * HERO.fps;
  const hero = {} as Record<"wide" | "tall", HeroRendition>;
  const descent = {} as Record<"wide" | "tall", DescentRendition>;
  for (const key of ["wide", "tall"] as const) {
    const h = record.hero[key], frames = path.join(src, `hero-${key}`), file = path.join(work, `hero-${key}.mp4`);
    encodeVideo(frames, HERO.fps, file, "hero");
    check(frameCount(file) === heroFrames, `hero-${key}.mp4 has ${frameCount(file)} frames, not ${heroFrames}`);
    const poster = await picture(path.join(frames, frameName(0)), work, `hero-${key}-poster`, urlDir, key === "wide" ? [800, h.width] : [h.width / 2, h.width], false);
    hero[key] = { video: { mp4: `${urlDir}/hero-${key}.mp4`, width: h.width, height: h.height, frames: heroFrames, fps: HERO.fps }, poster, camera: h.camera as HeroRendition["camera"], metresPerPixel: h.metresPerPixel };

    const d = record.descent[key], dFrames = path.join(src, `descent-${key}`), dFile = path.join(work, `descent-${key}.mp4`), count = 3 * d.framesPerStage + 1;
    encodeVideo(dFrames, DESCENT.fps, dFile, "descent");
    check(frameCount(dFile) === count, `descent-${key}.mp4 has ${frameCount(dFile)} frames, not ${count}`);
    const stills: Picture[] = [];
    for (let stage = 0; stage <= 3; stage++) {
      stills.push(await picture(path.join(dFrames, frameName(stage * d.framesPerStage)), work, `descent-${key}-s${stage}`, urlDir, key === "wide" ? [800, d.width] : [d.width / 2, d.width], false));
    }
    descent[key] = { video: { mp4: `${urlDir}/descent-${key}.mp4`, width: d.width, height: d.height, frames: count, fps: DESCENT.fps }, stills, framesPerStage: d.framesPerStage, tracks: d.tracks };
    console.log(`hero-${key}.mp4 ${mb(await size(file))}, descent-${key}.mp4 ${mb(await size(dFile))}`);
  }

  // AVIF: the elevation frames' coloured dots cost WebP about four times the bytes.
  for (const colouring of ["photo", "elevation"] as const) {
    for (let i = 0; i < TURNTABLE.frames; i++) {
      await sharp(path.join(src, `try-${colouring}`, frameName(i, 2)))
        .avif({ quality: 45, effort: 6 })
        .toFile(path.join(work, `try/${colouring}`, `${String(i).padStart(2, "0")}.avif`));
    }
  }
  const turntablePoster = await picture(path.join(src, "try-photo", frameName(0, 2)), work, "try-poster", urlDir, [640, TURNTABLE.width], false);

  const stills = {} as Record<StillName, Picture | null>;
  for (const name of ["relief", "change", "swipeBefore", "swipeAfter", "profile", "contoursPipeline", "contoursMining", "construction", "corridor", "closing"] as StillName[]) {
    if (!record.stills.includes(name)) {
      stills[name] = null;
      continue;
    }
    const input = path.join(src, "stills", `${name}.png`), width = (await sharp(input).metadata()).width!;
    stills[name] = await picture(input, work, `still-${name}`, urlDir, width >= 1000 ? [Math.round(width / 2), width] : [width], LINE_ART.includes(name));
  }

  const files = await readdir(work, { recursive: true, withFileTypes: true });
  const turntableBytes = { photo: 0, elevation: 0 };
  let stillBytes = 0, total = 0;
  for (const e of files) {
    if (!e.isFile()) continue;
    const file = path.join(e.parentPath, e.name), bytes = await size(file);
    total += bytes;
    if (e.name.startsWith("still-") && e.name.endsWith(".avif")) stillBytes += bytes;
    if (file.includes(`${path.sep}try${path.sep}photo`)) turntableBytes.photo += bytes;
    if (file.includes(`${path.sep}try${path.sep}elevation`)) turntableBytes.elevation += bytes;
  }
  check((await size(path.join(work, "hero-wide.mp4"))) <= BUDGET.heroWide, `hero-wide.mp4 is over ${mb(BUDGET.heroWide)}`);
  check((await size(path.join(work, "hero-tall.mp4"))) <= BUDGET.heroTall, `hero-tall.mp4 is over ${mb(BUDGET.heroTall)}`);
  check((await size(path.join(work, "descent-wide.mp4"))) <= BUDGET.descentWide, `descent-wide.mp4 is over ${mb(BUDGET.descentWide)}`);
  check((await size(path.join(work, "descent-tall.mp4"))) <= BUDGET.descentTall, `descent-tall.mp4 is over ${mb(BUDGET.descentTall)}`);
  check(turntableBytes.photo <= BUDGET.turntableSet && turntableBytes.elevation <= BUDGET.turntableSet, `a turntable set is over ${mb(BUDGET.turntableSet)}`);
  check(stillBytes <= BUDGET.stillsTotal, `the AVIF stills total ${mb(stillBytes)}, over ${mb(BUDGET.stillsTotal)}`);
  check(total <= BUDGET.folder, `the capture folder is ${mb(total)}, over ${mb(BUDGET.folder)}`);
  console.log(`turntable photo ${mb(turntableBytes.photo)}, elevation ${mb(turntableBytes.elevation)}; stills (AVIF) ${mb(stillBytes)}; folder ${mb(total)}`);

  if (!process.env.SKIP_VMAF) {
    for (const key of ["wide", "tall"] as const) {
      const h = vmaf(path.join(work, `hero-${key}.mp4`), path.join(src, `hero-${key}`), HERO.fps);
      const d = vmaf(path.join(work, `descent-${key}.mp4`), path.join(src, `descent-${key}`), DESCENT.fps);
      console.log(`VMAF hero-${key} ${h.toFixed(1)}, descent-${key} ${d.toFixed(1)}`);
      check(h >= VMAF_FLOOR.hero, `hero-${key} VMAF ${h.toFixed(1)} is under ${VMAF_FLOOR.hero}`);
      check(d >= VMAF_FLOOR.descent, `descent-${key} VMAF ${d.toFixed(1)} is under ${VMAF_FLOOR.descent}`);
    }
  }
  if (problems.length) throw new Error(`Encoding missed its checks:\n- ${problems.join("\n- ")}`);

  const dirName = `${slug}-${await hashDir(work)}`;
  const info = record.info as unknown as Pick<LandingMedia, "site" | "frame" | "figures">;
  const draft: LandingMedia = {
    version: 1,
    capturedAt: record.capturedAt,
    surveyId,
    site: { ...info.site, source: null },
    frame: info.frame,
    figures: info.figures,
    hero: { loop: HERO.loop, yaw0: HERO.yaw0, sway: HERO.sway, ...hero },
    descent: { stageAltitudes: record.info.stageAltitudes, ...descent },
    turntable: {
      frames: TURNTABLE.frames,
      yaw0: TURNTABLE.yaw0,
      step: TURNTABLE.step,
      width: record.turntable.width,
      height: record.turntable.height,
      photo: `${urlDir}/try/photo/{i}.avif`,
      elevation: `${urlDir}/try/elevation/{i}.avif`,
      poster: turntablePoster,
      presets: record.info.presets.map((p, i) => ({ ...p, marks: record.turntable.marks[i] })),
    },
    stills,
  };
  const media = validateMedia(JSON.parse(JSON.stringify(draft).replaceAll("__DIR__", dirName)));

  const target = path.join(LANDING, dirName);
  await mkdir(LANDING, { recursive: true });
  await rm(target, { recursive: true, force: true });
  await rename(work, target);
  for (const file of mediaFiles(media)) await stat(path.join(PUBLIC, file));
  for (const old of await readdir(LANDING)) if (old !== dirName) await rm(path.join(LANDING, old), { recursive: true, force: true });
  await writeFile(MANIFEST, `${JSON.stringify(media, null, 2)}\n`);
  console.log(`Wrote public/landing/${dirName} and src/lib/landing/media.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
