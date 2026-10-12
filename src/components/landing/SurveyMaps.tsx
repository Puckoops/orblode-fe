"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatNumber, formatSigned } from "@/lib/landing/format";
import { gridProfile } from "@/lib/landing/grid";
import type { SurveyScene } from "@/lib/landing/survey";
import styles from "./landing.module.css";
import { accent, drawContours, paintPixels } from "./scene/draw";
import { watchVisibility } from "./scene/env";
import { loadScene, type Scene } from "./scene/jobs";
import { drawProfile } from "./MeasureTiles";
import { useSite } from "./SiteContext";

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
export function SurveyPicture({ kind, label }: { kind: PictureKind; label: string }) {
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
  return <canvas ref={ref} width={600} height={400} role="img" aria-label={label} className={`${styles.mapCanvas} ${styles.fitCanvas}`} style={{ aspectRatio: "16 / 10" }} />;
}

/** The survey's contours over a dark relief tint. */
export function SurveyContours({ label, size }: { label: string; size: readonly [number, number] }) {
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
      className={`${styles.mapCanvas} ${styles.fitCanvas}`}
      style={{ aspectRatio: `${size[0]} / ${size[1]}` }}
    />
  );
}

/** Earlier against latest orthophoto, or photo against elevation when the site has one survey. */
export function SurveySwipe({ before, after }: { before: string; after: string }) {
  const [split, setSplit] = useState(50);
  const [ref, scene] = useSceneWhenNear<HTMLDivElement>();
  useEffect(() => {
    const frame = ref.current, survey = scene?.survey;
    if (!frame || !survey) return;
    const { nx, ny } = survey.grid, [left, right] = Array.from(frame.querySelectorAll("canvas"));
    frame.style.aspectRatio = `${nx} / ${ny}`;
    [
      [left, survey.earlierPhoto ?? survey.relief],
      [right, survey.photo],
    ].forEach(([canvas, pixels]) => {
      const target = canvas as HTMLCanvasElement;
      target.width = nx;
      target.height = ny;
      paintPixels(target, pixels as Uint8ClampedArray, nx, ny);
      target.dataset.ready = "";
    });
  }, [scene, ref]);
  return (
    <div ref={ref} className={styles.compare} style={{ "--split": `${split}%` } as CSSProperties}>
      <canvas width={300} height={200} aria-hidden="true" className={styles.mapCanvas} />
      <canvas width={300} height={200} aria-hidden="true" className={`${styles.mapCanvas} ${styles.compareAfter}`} />
      <span className={`${styles.compareLabel} ${styles.compareLabelLeft}`}>{before.toUpperCase()}</span>
      <span className={`${styles.compareLabel} ${styles.compareLabelRight}`}>{after.toUpperCase()}</span>
      <span aria-hidden="true" className={styles.compareHandle} />
      <label htmlFor="compare-split" className={styles.srOnly}>
        Divider between {before} and {after}
      </label>
      <input id="compare-split" type="range" min={0} max={100} step={1} value={split} onChange={(e) => setSplit(Number(e.target.value))} />
    </div>
  );
}

/** A west–east section through the featured measurement, or through the middle of the site. */
export function SurveyProfile() {
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
      className={styles.mapCanvas}
    />
  );
}

/** Ground added and removed between the two surveys, estimated on the preview grid. */
export function ChangeFigures() {
  const [ref, scene] = useSceneWhenNear<HTMLDivElement>();
  const change = scene?.survey?.change ?? null;
  const cell = scene?.survey ? formatNumber(scene.survey.grid.cell, 1) : "–";
  return (
    <div ref={ref} className={styles.cutFillRow}>
      <div>
        <span className={styles.figureKey}>Added</span>
        <span className={styles.figureValue}>{change ? `${formatNumber(change.added)} m³` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Removed</span>
        <span className={styles.figureValue}>{change ? `${formatNumber(change.removed)} m³` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Net</span>
        <span className={styles.figureValue}>{change ? `${formatSigned(change.added - change.removed)} m³` : "–"}</span>
      </div>
      <p className={styles.small}>
        Estimated on this page&apos;s {cell} m preview grid; Orblode computes on 0.2 m.{" "}
        {change ? `Colour saturates at ±${formatNumber(change.range, 1)} m.` : ""}
      </p>
    </div>
  );
}

/** The survey's height range, from the scene once it has loaded. */
export function ReliefFigures() {
  const [ref, scene] = useSceneWhenNear<HTMLDivElement>();
  const cloud = scene?.cloud, interval = scene?.survey?.interval;
  return (
    <div ref={ref} className={styles.cutFillRow}>
      <div>
        <span className={styles.figureKey}>Lowest</span>
        <span className={styles.figureValue}>{cloud ? `${formatNumber(cloud.zmin, 1)} m` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Highest</span>
        <span className={styles.figureValue}>{cloud ? `${formatNumber(cloud.zmax, 1)} m` : "–"}</span>
      </div>
      <div>
        <span className={styles.figureKey}>Contours</span>
        <span className={styles.figureValue}>{interval ? `${formatNumber(interval, interval < 1 ? 2 : 0)} m` : "–"}</span>
      </div>
    </div>
  );
}
