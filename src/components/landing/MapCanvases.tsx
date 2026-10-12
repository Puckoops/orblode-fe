"use client";

import { useEffect, useRef } from "react";
import { cutFillColour } from "@/lib/landing/maps";
import type { Rgb } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { GROUND_CSS, accent, drawContours, drawCorridor, ink, type Region } from "./scene/draw";
import { cssFont, isCoarsePointer, watchVisibility } from "./scene/env";
import { compute } from "./scene/jobs";

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
export function ContourMap({ region, step, tint, minorAlpha, majorAlpha, lineWidth = 1.4, size, corridor, label, className }: ContourMapProps) {
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
      className={[styles.mapCanvas, className].filter(Boolean).join(" ")}
    />
  );
}

/** The pad's mean cut and fill per 10 m cell, north to the right, with Lot 4 marked. */
export function CutFillCells({ label }: { label: string }) {
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

  return <canvas ref={ref} width={1280} height={960} role="img" aria-label={label} className={styles.mapCanvas} />;
}
