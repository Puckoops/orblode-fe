"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/landing/format";
import { gridProfile } from "@/lib/landing/grid";
import { cutFillColour } from "@/lib/landing/maps";
import type { StillName } from "@/lib/landing/media";
import type { SurveyScene } from "@/lib/landing/survey";
import type { Rgb } from "@/lib/landing/terrain";
import { cssFont, isCoarsePointer, watchVisibility } from "../env";
import styles from "../landing.module.css";
import { GROUND_CSS, MUTED, accent, drawContours, drawCorridor, ink, paintPixels, type Region } from "../scene/draw";
import { compute, loadScene, type Scene } from "../scene/jobs";
import { useSite } from "../SiteContext";

// The canvases the landing used to draw live, now only drawn here for scripts/landing/capture.ts to read.

/** The shared scene, once it has loaded and this element has come near the viewport. */
function useSceneWhenNear<T extends HTMLElement>() {
  const site = useSite();
  const ref = useRef<T>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true, started = false;
    const stop = watchVisibility(
      el,
      (visible) => {
        if (!visible || started) return;
        started = true;
        loadScene(site).then(
          (s) => alive && setScene(s),
          () => {},
        );
      },
      "600px 0px",
    );
    return () => {
      alive = false;
      stop();
    };
  }, [site]);
  return [ref, scene] as const;
}

type PictureKind = "photo" | "relief" | "change";

const pixelsOf = (survey: SurveyScene, kind: PictureKind) => (kind === "change" ? survey.change?.pixels : kind === "relief" ? survey.relief : survey.photo) ?? null;

/** One of the survey's north-up pictures, with the featured measurement outlined. */
function SurveyPicture({ kind, label }: { kind: PictureKind; label: string }) {
  const site = useSite();
  const [ref, scene] = useSceneWhenNear<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = ref.current, survey = scene?.survey;
    const pixels = survey ? pixelsOf(survey, kind) : null;
    if (!canvas || !survey || !pixels) return;
    const { grid } = survey, scale = 2;
    canvas.width = grid.nx * scale;
    canvas.height = grid.ny * scale;
    const ctx = paintPixels(canvas, pixels, grid.nx, grid.ny);
    const outline = site.featured?.outline;
    if (ctx && outline && outline.length > 2) {
      const px = (x: number) => ((x - grid.x0) / grid.cell) * scale, py = (y: number) => ((grid.y1 - y) / grid.cell) * scale;
      ctx.beginPath();
      outline.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
      ctx.closePath();
      ctx.fillStyle = accent(0.14);
      ctx.fill();
      ctx.strokeStyle = accent();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    canvas.dataset.ready = "";
  }, [scene, kind, site, ref]);
  return <canvas ref={ref} width={600} height={400} role="img" aria-label={label} className={`${styles.mapImage} ${styles.fitImage}`} style={{ aspectRatio: "16 / 10" }} />;
}

/** The survey's contours over a dark relief tint. */
function SurveyContours({ label, size }: { label: string; size: readonly [number, number] }) {
  const [ref, scene] = useSceneWhenNear<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = ref.current, survey = scene?.survey;
    if (!canvas || !survey) return;
    const { nx, ny } = survey.contours, k = Math.min(size[0] / nx, size[1] / ny);
    canvas.width = Math.round(nx * k);
    canvas.height = Math.round(ny * k);
    drawContours(canvas, survey.contours, { minorAlpha: 0.16, majorAlpha: 0.55, lineWidth: Math.max(1, k / 2.5) });
    canvas.dataset.ready = "";
  }, [scene, size, ref]);
  return (
    <canvas
      ref={ref}
      width={size[0]}
      height={size[1]}
      role="img"
      aria-label={label}
      className={`${styles.mapImage} ${styles.fitImage}`}
      style={{ aspectRatio: `${size[0]} / ${size[1]}` }}
    />
  );
}

/** A west–east section through the featured measurement, or through the middle of the site. */
function SurveyProfile() {
  const site = useSite();
  const [ref, scene] = useSceneWhenNear<HTMLCanvasElement>();
  useEffect(() => {
    const canvas = ref.current, survey = scene?.survey;
    if (!canvas || !survey || !scene) return;
    const y = site.featured?.centre[1] ?? scene.frame.cy;
    const points = gridProfile(survey.grid, y, survey.grid.cell);
    if (points.length > 1) drawProfile(canvas, points);
  }, [scene, site, ref]);
  return (
    <canvas
      ref={ref}
      width={1280}
      height={720}
      role="img"
      aria-label={`Elevation section from A in the west to A prime in the east${site.featured ? ` through ${site.featured.name}` : ""}`}
      className={styles.mapImage}
    />
  );
}

const STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const niceStep = (span: number, marks: number) => STEPS.find((s) => span / s <= marks) ?? STEPS[STEPS.length - 1];

/** Draws distance (m) against height (m) as a filled section from A to A′. */
function drawProfile(canvas: HTMLCanvasElement, points: [number, number][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || points.length < 2) return;
  const mono = cssFont(canvas, "--font-mono", "monospace"), scale = canvas.width / 640, W = 640, H = canvas.height / scale;
  const length = points[points.length - 1][0];
  let lo = Infinity, hi = -Infinity;
  for (const [, z] of points) {
    lo = Math.min(lo, z);
    hi = Math.max(hi, z);
  }
  const zStep = niceStep(hi - lo, 4), dStep = niceStep(length, 5);
  lo = Math.floor(lo / zStep) * zStep;
  hi = Math.max(lo + zStep, Math.ceil(hi / zStep) * zStep);
  const pad = { left: 52, right: 18, top: 30, bottom: 40 };
  const X = (d: number) => pad.left + (d / length) * (W - pad.left - pad.right);
  const Y = (z: number) => H - pad.bottom - ((z - lo) / (hi - lo)) * (H - pad.top - pad.bottom);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = GROUND_CSS;
  ctx.fillRect(0, 0, W, H);
  ctx.font = `12px ${mono}`;
  ctx.lineWidth = 1;
  ctx.textAlign = "right";
  for (let z = lo; z <= hi + 1e-6; z += zStep) {
    ctx.strokeStyle = ink(0.08);
    ctx.beginPath();
    ctx.moveTo(pad.left, Y(z) + 0.5);
    ctx.lineTo(W - pad.right, Y(z) + 0.5);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.fillText(formatNumber(z), pad.left - 10, Y(z) + 4);
  }
  ctx.textAlign = "center";
  for (let d = 0; d <= length; d += dStep) ctx.fillText(formatNumber(d), X(d), H - pad.bottom + 20);
  ctx.textAlign = "left";
  ctx.fillText("m", W - pad.right - 6, H - pad.bottom + 20);
  const trace = () => {
    ctx.beginPath();
    points.forEach(([d, z], i) => (i ? ctx.lineTo(X(d), Y(z)) : ctx.moveTo(X(d), Y(z))));
  };
  trace();
  ctx.lineTo(X(length), Y(lo));
  ctx.lineTo(X(points[0][0]), Y(lo));
  ctx.closePath();
  ctx.fillStyle = accent(0.14);
  ctx.fill();
  trace();
  ctx.strokeStyle = accent();
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = ink();
  ctx.font = `500 13px ${mono}`;
  ctx.fillText("A", X(0), pad.top - 12);
  ctx.textAlign = "right";
  ctx.fillText("A′", X(length), pad.top - 12);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  canvas.dataset.ready = "";
}

const MAX_SAMPLES = 70_000;

type ContourMapProps = {
  region: Region;
  /** Grid spacing in metres; coarsened if the map would need more than MAX_SAMPLES heights. */
  step: number;
  tint: boolean;
  minorAlpha: number;
  majorAlpha: number;
  lineWidth?: number;
  /** The canvas's drawing size. Without one the map fills its box, keeping `region`'s width and centre. */
  size?: readonly [number, number];
  corridor?: boolean;
  label?: string;
  className?: string;
};

/** A contour map of part of the sample site at 2 m intervals, every 10 m drawn heavier. */
function ContourMap({ region, step, tint, minorAlpha, majorAlpha, lineWidth = 1.4, size, corridor, label, className }: ContourMapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { x0, x1, y0, y1 } = region;
  const [width, height] = size ?? [0, 0];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true, started = false;
    const draw = () => {
      let area: Region = { x0, x1, y0, y1 }, lines = lineWidth;
      if (!width) {
        const rect = canvas.getBoundingClientRect(), k = isCoarsePointer() ? 1 : 1.5;
        if (rect.width < 2 || rect.height < 2) return;
        canvas.width = Math.round(rect.width * k);
        canvas.height = Math.round(rect.height * k);
        const half = ((x1 - x0) * rect.height) / rect.width / 2, mid = (y0 + y1) / 2;
        area = { x0, x1, y0: mid - half, y1: mid + half };
        lines = lineWidth * k;
      }
      const cells = ((area.x1 - area.x0) * (area.y1 - area.y0)) / (step * step);
      const grid = cells > MAX_SAMPLES ? step * Math.sqrt(cells / MAX_SAMPLES) : step;
      compute({ kind: "contours", ...area, step: grid, interval: 2, index: 10, tint }).then((contours) => {
        if (!alive) return;
        const ctx = drawContours(canvas, contours, { minorAlpha, majorAlpha, lineWidth: lines });
        if (ctx && corridor) drawCorridor(ctx, canvas, area, cssFont(canvas, "--font-mono", "monospace"));
        canvas.dataset.ready = "";
      }, () => {});
    };
    const stop = watchVisibility(
      canvas,
      (visible) => {
        if (!visible || started) return;
        started = true;
        draw();
      },
      "600px 0px",
    );
    return () => {
      alive = false;
      stop();
    };
  }, [x0, x1, y0, y1, step, tint, minorAlpha, majorAlpha, lineWidth, width, corridor]);

  return (
    <canvas
      ref={ref}
      width={width || undefined}
      height={height || undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={[styles.mapImage, className].filter(Boolean).join(" ")}
    />
  );
}

/** The pad's mean cut and fill per 10 m cell, north to the right, with Lot 4 marked. */
function CutFillCells({ label }: { label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let alive = true, started = false;
    const draw = () =>
      compute({ kind: "cutFillGrid", cell: 10 }).then(({ columns, rows, diff }) => {
        const ctx = canvas.getContext("2d");
        if (!alive || !ctx) return;
        const W = canvas.width, H = canvas.height, px = Math.min(W / (columns + 2), H / (rows + 2));
        const ox = (W - columns * px) / 2, oy = (H - rows * px) / 2, colour: Rgb = [0, 0, 0];
        ctx.fillStyle = GROUND_CSS;
        ctx.fillRect(0, 0, W, H);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < columns; col++) {
            cutFillColour(diff[row * columns + col], colour);
            ctx.fillStyle = `rgb(${colour.map(Math.round).join(",")})`;
            ctx.fillRect(ox + col * px + 1, oy + row * px + 1, px - 2, px - 2);
          }
        }
        ctx.strokeStyle = accent(0.85);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(ox + 4 * px, oy + 3 * px, 18 * px, 12 * px);
        ctx.setLineDash([]);
        ctx.fillStyle = ink();
        ctx.font = `500 26px ${cssFont(canvas, "--font-mono", "monospace")}`;
        ctx.fillText("LOT 4", ox + 4 * px + 10, oy + 3 * px - 12);
        canvas.dataset.ready = "";
      }, () => {});
    const stop = watchVisibility(
      canvas,
      (visible) => {
        if (!visible || started) return;
        started = true;
        draw();
      },
      "600px 0px",
    );
    return () => {
      alive = false;
      stop();
    };
  }, []);

  return <canvas ref={ref} width={1280} height={960} role="img" aria-label={label} className={styles.mapImage} />;
}

type PixelsKind = "photo" | "before";

const swipePixels = (survey: SurveyScene, kind: PixelsKind) => (kind === "photo" ? survey.photo : (survey.earlierPhoto ?? survey.relief));

/** One of the survey's north-up pictures on its own grid, without an outline: the two sides of the swipe. */
function SurveyPixels({ kind }: { kind: PixelsKind }) {
  const site = useSite();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    loadScene(site).then((scene) => {
      const canvas = ref.current, survey = scene.survey;
      if (!alive || !canvas || !survey) return;
      const { nx, ny } = survey.grid;
      canvas.width = nx;
      canvas.height = ny;
      paintPixels(canvas, swipePixels(survey, kind), nx, ny);
      canvas.dataset.ready = "";
    }, () => {});
    return () => {
      alive = false;
    };
  }, [site, kind]);
  return <canvas ref={ref} width={300} height={200} />;
}

// Stacked in the top-left corner, so every canvas is on screen and its lazy draw starts at once.
const Still = ({ name, box, children }: { name: StillName; box?: [number, number]; children: React.ReactNode }) => (
  <div data-still={name} style={{ position: "absolute", left: 0, top: 0, width: box?.[0] ?? 640, height: box?.[1] }}>
    {children}
  </div>
);

/** Every still the landing shows, drawn by the same canvases the live page used, for the capture script to read. */
export function CaptureStills() {
  const site = useSite();
  return (
    <div style={{ position: "absolute", left: 0, top: 0, zIndex: -1 }}>
      {site.earlierDate ? (
        <Still name="change">
          <SurveyPicture kind="change" label="change" />
        </Still>
      ) : null}
      <Still name="relief">
        <SurveyPicture kind="relief" label="relief" />
      </Still>
      <Still name="swipeBefore">
        <SurveyPixels kind="before" />
      </Still>
      <Still name="swipeAfter">
        <SurveyPixels kind="photo" />
      </Still>
      <Still name="profile">
        <SurveyProfile />
      </Still>
      <Still name="contoursPipeline">
        <SurveyContours label="pipeline" size={[640, 360]} />
      </Still>
      <Still name="contoursMining">
        <SurveyContours label="mining" size={[1280, 960]} />
      </Still>
      <Still name="construction">
        <CutFillCells label="construction" />
      </Still>
      <Still name="corridor">
        <ContourMap region={{ x0: -430, x1: -30, y0: -430, y1: -130 }} step={2.5} tint={false} minorAlpha={0.1} majorAlpha={0.28} lineWidth={1.6} size={[1280, 960]} corridor label="corridor" />
      </Still>
      <Still name="closing" box={[1200, 533]}>
        <ContourMap region={{ x0: -450, x1: 410, y0: -170, y1: 190 }} step={2.5} tint minorAlpha={0.07} majorAlpha={0.2} lineWidth={1.2} className={styles.layer} />
      </Still>
    </div>
  );
}
