// Renders the landing's pictures from the showcase survey, frame by frame, with the same painters the
// live page used: starts next dev with the capture route, drives it in Google Chrome, and writes PNGs
// plus capture.json to .landing-capture/<survey id>/. Then run encode.ts (npm run landing:encode).
//
//   ORBLODE_SVC_URL=https://api.dev.puckoops.com/orblode-svc/api/v1 npm run landing:capture
//   ... npm run landing:capture -- --only=turntable,stills   # re-capture some sets into the last capture
//
// LANDING_SURVEY_ID fails the run when the flagged survey is another one; CHROME_PATH picks the browser.
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { CACHE, DESCENT, HERO, PASSES, ROOT, TURNTABLE, frameName, gitCommit, heroYaw, roundPoint, trackOf, type CaptureRecord, type Normalised } from "./lib.ts";

type CaptureSet = "hero" | "descent" | "turntable" | "stills";

const PORT = Number(process.env.LANDING_CAPTURE_PORT ?? 3199);
const BASE = `http://localhost:${PORT}`;
const svc = process.env.ORBLODE_SVC_URL;
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") as CaptureSet[] | undefined;
const wanted = (set: CaptureSet) => !only || only.includes(set);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startServer(log: string): ChildProcess {
  const out = createWriteStream(log);
  const child = spawn(path.join(ROOT, "node_modules/.bin/next"), ["dev", "--webpack", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, LANDING_CAPTURE: "1", ORBLODE_SVC_URL: svc, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return child;
}

async function waitForServer(log: string) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/landing-capture`).catch(() => null);
    if (res?.ok) return;
    if (res && res.status !== 404) throw new Error(`/landing-capture answered ${res.status}; see ${log}`);
    await sleep(1000);
  }
  throw new Error(`next dev never served /landing-capture; see ${log}`);
}

type Pass = { css: readonly [number, number]; scale: number };

async function openStage(browser: Browser, pass: Pass, query = "") {
  const context = await browser.newContext({ viewport: { width: pass.css[0], height: pass.css[1] }, deviceScaleFactor: pass.scale, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.error("[page]", m.text());
  });
  await page.goto(`${BASE}/landing-capture${query}`, { waitUntil: "load", timeout: 240_000 });
  await page.waitForFunction(() => !!window.__landingCapture, null, { timeout: 120_000 });
  const info = await page.evaluate(() => window.__landingCapture!.ready());
  return { context, page, info };
}

const resize = (page: Page, [w, h]: readonly [number, number]) => page.evaluate(([w, h]) => window.__landingCapture!.size(w, h), [w, h] as const);

const writePng = (file: string, dataUrl: string) => writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));

/** Paints `count` frames into `dir`, writing each PNG while the next one draws; returns what `paint` returned besides the PNG. */
async function frames<T extends { png: string }>(label: string, dir: string, count: number, digits: number, paint: (i: number) => Promise<T>): Promise<Omit<T, "png">[]> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const out: Omit<T, "png">[] = [];
  let writing: Promise<void> = Promise.resolve();
  const started = Date.now();
  for (let i = 0; i < count; i++) {
    const { png, ...rest } = await paint(i);
    await writing;
    writing = writePng(path.join(dir, frameName(i, digits)), png);
    out.push(rest);
    if ((i + 1) % 60 === 0 || i === count - 1) console.log(`${label}: ${i + 1}/${count} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  await writing;
  return out;
}

async function main() {
  if (!svc) throw new Error("Set ORBLODE_SVC_URL to orblode-svc's /api/v1 base, e.g. https://api.dev.puckoops.com/orblode-svc/api/v1");
  await mkdir(CACHE, { recursive: true });
  const log = path.join(CACHE, "next-dev.log");
  console.log(`Starting next dev on :${PORT} (log: ${log})`);
  const server = startServer(log);
  let browser: Browser | null = null;
  try {
    await waitForServer(log);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }) });

    const wide = await openStage(browser, PASSES.heroWide);
    const info = wide.info;
    if (process.env.LANDING_SURVEY_ID && !info.surveyId.startsWith(process.env.LANDING_SURVEY_ID)) {
      throw new Error(`The flagged survey is ${info.surveyId}, not ${process.env.LANDING_SURVEY_ID}`);
    }
    const dir = path.join(CACHE, info.surveyId);
    await mkdir(dir, { recursive: true });
    const previous: Partial<CaptureRecord> = only ? JSON.parse(await readFile(path.join(dir, "capture.json"), "utf8").catch(() => "{}")) : {};
    const record: CaptureRecord = {
      ...(previous as CaptureRecord),
      capturedAt: new Date().toISOString(),
      renderer: { commit: gitCommit(), chrome: browser.version() },
      info,
    };
    console.log(`Capturing ${info.site.name} (${info.surveyId}) into ${path.relative(ROOT, dir)}`);

    const heroFrames = HERO.loop * HERO.fps;
    const heroPass = async (page: Page, key: "wide" | "tall", pass: Pass) => {
      const size = await resize(page, pass.css);
      const shots = await frames(`hero ${key}`, path.join(dir, `hero-${key}`), heroFrames, 4, (i) => page.evaluate((yaw) => window.__landingCapture!.hero(yaw), heroYaw(i)));
      return { ...size, camera: shots[0].camera, metresPerPixel: shots[0].metresPerPixel };
    };
    const descentPass = async (page: Page, key: "wide" | "tall", pass: Pass) => {
      const size = await resize(page, pass.css), perStage = DESCENT.framesPerStage[key];
      const shots = await frames(`descent ${key}`, path.join(dir, `descent-${key}`), 3 * perStage + 1, 4, (i) => page.evaluate((s) => window.__landingCapture!.descent(s), i / perStage));
      return { ...size, framesPerStage: perStage, tracks: { survey: trackOf(shots.map((f) => f.survey)), pile: trackOf(shots.map((f) => f.pile)) } };
    };

    if (wanted("hero") || wanted("descent")) {
      record.hero = { ...record.hero };
      record.descent = { ...record.descent };
      if (wanted("hero")) record.hero.wide = await heroPass(wide.page, "wide", PASSES.heroWide);
      if (wanted("descent")) record.descent.wide = await descentPass(wide.page, "wide", PASSES.descentWide);
      const tall = await openStage(browser, PASSES.heroTall);
      if (wanted("hero")) record.hero.tall = await heroPass(tall.page, "tall", PASSES.heroTall);
      if (wanted("descent")) record.descent.tall = await descentPass(tall.page, "tall", PASSES.descentTall);
      await tall.context.close();
    }
    await wide.context.close();

    if (wanted("turntable") || wanted("stills")) {
      const flat = await openStage(browser, PASSES.turntable, wanted("stills") ? "?stills=1" : "");
      if (wanted("turntable")) {
        const size = await resize(flat.page, PASSES.turntable.css);
        const yaw = (i: number) => TURNTABLE.yaw0 + i * TURNTABLE.step;
        const photo = await frames("turntable photo", path.join(dir, "try-photo"), TURNTABLE.frames, 2, (i) => flat.page.evaluate(([y]) => window.__landingCapture!.turntable(y, false), [yaw(i)] as const));
        await frames("turntable elevation", path.join(dir, "try-elevation"), TURNTABLE.frames, 2, (i) => flat.page.evaluate(([y]) => window.__landingCapture!.turntable(y, true), [yaw(i)] as const));
        const marks = info.presets.map((_, p) =>
          photo.map(({ marks: m }) => {
            const a: Normalised = roundPoint(m[2 * p]), b: Normalised = roundPoint(m[2 * p + 1]);
            return a && b ? ([a[0], a[1], b[0], b[1]] as [number, number, number, number]) : null;
          }),
        );
        record.turntable = { ...size, marks };
      }
      if (wanted("stills")) {
        const stills = await flat.page.evaluate(() => window.__landingCapture!.stills());
        const stillsDir = path.join(dir, "stills");
        await rm(stillsDir, { recursive: true, force: true });
        await mkdir(stillsDir, { recursive: true });
        await Promise.all(Object.entries(stills).map(([name, png]) => writePng(path.join(stillsDir, `${name}.png`), png)));
        record.stills = Object.keys(stills);
        console.log(`stills: ${record.stills.join(", ")}`);
      }
      await flat.context.close();
    }

    await writeFile(path.join(dir, "capture.json"), `${JSON.stringify(record, null, 2)}\n`);
    await writeFile(path.join(CACHE, "latest"), `${info.surveyId}\n`);
    console.log(`Done. Next: npm run landing:encode`);
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
