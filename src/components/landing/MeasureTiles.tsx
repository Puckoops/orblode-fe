"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatNumber } from "@/lib/landing/format";
import { profile } from "@/lib/landing/maps";
import { EARLIER_PILE_SCALE, PAD } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { GROUND_CSS, MUTED, accent, ink, paintPixels } from "./scene/draw";
import { cssFont, isCoarsePointer, watchVisibility } from "./scene/env";
import { compute } from "./scene/jobs";

/** Runs `draw` once, the first time `ref`'s element comes within reach of the viewport. */
function useDrawWhenNear<T extends HTMLElement>(draw: (el: T, isAlive: () => boolean) => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true, started = false;
    const stop = watchVisibility(
      el,
      (visible) => {
        if (!visible || started) return;
        started = true;
        draw(el, () => alive);
      },
      "600px 0px",
    );
    return () => {
      alive = false;
      stop();
    };
  }, [draw]);
  return ref;
}

const PAD_WIDTH = PAD.y1 - PAD.y0;

function drawCutFill(canvas: HTMLCanvasElement, isAlive: () => boolean) {
  compute({ kind: "cutFill" }).then((image) => {
    if (!isAlive()) return;
    canvas.width = image.width * 2;
    canvas.height = image.height * 2;
    const ctx = paintPixels(canvas, image.pixels, image.width, image.height);
    if (!ctx) return;
    ctx.strokeStyle = ink(0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 20; c < image.width; c += 20) {
      ctx.moveTo(c * 2 + 0.5, 0);
      ctx.lineTo(c * 2 + 0.5, canvas.height);
    }
    for (let r = 20; r < image.height; r += 20) {
      ctx.moveTo(0, r * 2 + 0.5);
      ctx.lineTo(canvas.width, r * 2 + 0.5);
    }
    ctx.stroke();
    canvas.dataset.ready = "";
  }, () => {});
}

/** The pad's cut and fill against its design surface, turned so north points right. */
export function CutFillMap() {
  const ref = useDrawWhenNear<HTMLCanvasElement>(drawCutFill);
  return (
    <div className={styles.mapFrame}>
      <canvas
        ref={ref}
        width={PAD_WIDTH * 2}
        height={(PAD.x1 - PAD.x0) * 2}
        role="img"
        aria-label="Cut and fill map of the stockpile pad against its design surface"
        className={styles.mapCanvas}
      />
      <span className={`${styles.mapTag} ${styles.mapTagNorth}`}>N →</span>
      <span className={`${styles.mapTag} ${styles.mapTagScale}`}>
        <i style={{ width: `${((50 / PAD_WIDTH) * 100).toFixed(2)}cqw` }} />
        50 m
      </span>
    </div>
  );
}

const COMPARE_AREA = { x0: 150, y0: -200, size: 130 };

const COMPARE_SCALES = [EARLIER_PILE_SCALE, 1];

function drawCompare(frame: HTMLDivElement, isAlive: () => boolean) {
  const px = isCoarsePointer() ? 200 : 240;
  frame.querySelectorAll("canvas").forEach((canvas, i) => {
    compute({ kind: "ortho", ...COMPARE_AREA, px, firstPileScale: COMPARE_SCALES[i] }).then((pixels) => {
      if (!isAlive()) return;
      canvas.width = canvas.height = px;
      paintPixels(canvas, pixels, px, px);
      canvas.dataset.ready = "";
    }, () => {});
  });
}

/** Two orthophotos of Stockpile 1, a month apart, with a divider to drag between them. */
export function SurveyCompare({ before, after }: { before: string; after: string }) {
  const [split, setSplit] = useState(50);
  const ref = useDrawWhenNear<HTMLDivElement>(drawCompare);
  return (
    <div ref={ref} className={styles.compare} style={{ "--split": `${split}%` } as CSSProperties}>
      <canvas width={240} height={240} aria-hidden="true" className={styles.mapCanvas} />
      <canvas width={240} height={240} aria-hidden="true" className={`${styles.mapCanvas} ${styles.compareAfter}`} />
      <span className={`${styles.compareLabel} ${styles.compareLabelLeft}`}>{before.toUpperCase()}</span>
      <span className={`${styles.compareLabel} ${styles.compareLabelRight}`}>{after.toUpperCase()}</span>
      <span aria-hidden="true" className={styles.compareHandle} />
      <label htmlFor="compare-split" className={styles.srOnly}>
        Divider between the {before} and {after} surveys
      </label>
      <input id="compare-split" type="range" min={0} max={100} step={1} value={split} onChange={(e) => setSplit(Number(e.target.value))} />
    </div>
  );
}

const SECTION = { from: -330, to: 190, northing: 30 };
const STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const niceStep = (span: number, marks: number) => STEPS.find((s) => span / s <= marks) ?? STEPS[STEPS.length - 1];

/** Draws distance (m) against height (m) as a filled section from A to A′. */
export function drawProfile(canvas: HTMLCanvasElement, points: [number, number][]) {
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

const drawSampleProfile = (canvas: HTMLCanvasElement) => drawProfile(canvas, profile(SECTION.from, SECTION.to, SECTION.northing, 2));

/** A section through the pit from A in the west to A′ in the east. */
export function ProfileChart() {
  const ref = useDrawWhenNear<HTMLCanvasElement>(drawSampleProfile);
  return (
    <canvas
      ref={ref}
      width={1280}
      height={720}
      role="img"
      aria-label="Elevation profile from A to A prime across the pit, stepping down eight benches to the floor"
      className={styles.mapCanvas}
    />
  );
}
