import type { Contours } from "@/lib/landing/maps";
import { chainageMarks } from "@/lib/landing/maps";

export const ink = (a = 1) => `rgba(242,230,214,${a})`;
export const accent = (a = 1) => `rgba(216,128,80,${a})`;
export const cool = (a = 1) => `rgba(122,142,168,${a})`;
export const MUTED = "#8a7e68";
export const GROUND_CSS = "#0e0c0a";

/** Paints a `width` × `height` RGBA buffer over the whole canvas, smoothing the scale-up. */
export function paintPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, width: number, height: number) {
  const ctx = canvas.getContext("2d");
  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d");
  if (!ctx || !sourceCtx) return null;
  source.width = width;
  source.height = height;
  sourceCtx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx;
}

export type ContourStyle = { minorAlpha: number; majorAlpha: number; lineWidth: number };

/** Draws contour lines over the canvas, north up, with the tint behind them when there is one. */
export function drawContours(canvas: HTMLCanvasElement, contours: Contours, style: ContourStyle) {
  const ctx = contours.tint ? paintPixels(canvas, contours.tint, contours.nx, contours.ny) : canvas.getContext("2d");
  if (!ctx) return null;
  const W = canvas.width, H = canvas.height, sx = W / (contours.nx - 1), sy = H / (contours.ny - 1);
  if (!contours.tint) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = GROUND_CSS;
    ctx.fillRect(0, 0, W, H);
  }
  const stroke = (segments: Float32Array, alpha: number, width: number) => {
    ctx.beginPath();
    for (let i = 0; i < segments.length; i += 4) {
      ctx.moveTo(segments[i] * sx, H - segments[i + 1] * sy);
      ctx.lineTo(segments[i + 2] * sx, H - segments[i + 3] * sy);
    }
    ctx.strokeStyle = ink(alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  };
  stroke(contours.minor, style.minorAlpha, style.lineWidth);
  stroke(contours.major, style.majorAlpha, style.lineWidth * 1.4);
  return ctx;
}

export type Region = { x0: number; x1: number; y0: number; y1: number };

const CORRIDOR: readonly (readonly [number, number])[] = [
  [-415, -395],
  [-320, -335],
  [-210, -350],
  [-120, -262],
  [-45, -160],
];

/** A 30 m corridor with chainage every 50 m and asset markers, drawn over a map of `region`. */
export function drawCorridor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, region: Region, mono: string) {
  const ppm = canvas.width / (region.x1 - region.x0);
  const toPx = (x: number, y: number): [number, number] => [(x - region.x0) * ppm, canvas.height - (y - region.y0) * ppm];
  const line = CORRIDOR.map(([x, y]) => toPx(x, y));
  const trace = () => {
    ctx.beginPath();
    line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  trace();
  ctx.strokeStyle = cool(0.22);
  ctx.lineWidth = 30 * ppm;
  ctx.stroke();
  trace();
  ctx.strokeStyle = accent();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = `22px ${mono}`;
  for (const mark of chainageMarks(CORRIDOR, 50)) {
    const [x, y] = toPx(mark.x, mark.y), nx = mark.normalX, ny = -mark.normalY;
    ctx.strokeStyle = ink();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - nx * 12, y - ny * 12);
    ctx.lineTo(x + nx * 12, y + ny * 12);
    ctx.stroke();
    if (mark.distance % 100 === 0) {
      ctx.fillStyle = ink();
      ctx.fillText(`0+${String(mark.distance).padStart(3, "0")}`, x + nx * 22 + 4, y + ny * 22 + 8);
    } else if (mark.distance < 400) {
      ctx.fillStyle = cool();
      ctx.fillRect(x - nx * 40 - 7, y - ny * 40 - 7, 14, 14);
      ctx.fillStyle = MUTED;
      ctx.fillText(`TX-28${90 + mark.distance / 50}`, x - nx * 40 + 14, y - ny * 40 + 8);
    }
  }
}
