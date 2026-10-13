import type { PointCloud } from "@/lib/landing/cloud";
import { eyeOf, type Camera } from "@/lib/landing/descent";
import { isCoarsePointer } from "../env";

export const GROUND_RGB = [14, 12, 10] as const;
const GROUND = (0xff000000 | (GROUND_RGB[2] << 16) | (GROUND_RGB[1] << 8) | GROUND_RGB[0]) >>> 0;
const MAX_SPLAT = 22;

type Vec3 = [number, number, number];
type Basis = { forward: Vec3; right: Vec3; up: Vec3; eye: Vec3; focal: number };

export type ScreenPoint = { x: number; y: number; depth: number };

/**
 * Draws a PointCloud into a 2D canvas through a z-buffer. Each point is a square sized to its grid
 * spacing, so near ground reads as a surface and distant ground as points. Projected coordinates
 * are CSS pixels relative to the canvas.
 */
export class CloudView {
  readonly camera: Camera = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.6, dist: 600, fov: 0.82 };
  /** 0 colours points from the photo, 1 by elevation. */
  colourMix = 0;
  splat = 1.25;
  /** Blends the whole cloud towards the ground colour; 0 draws nothing. */
  fade = 1;
  width = 0;
  height = 0;
  dpr = 1;
  cssWidth = 0;

  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly maxWidth: number;
  private readonly pickable: boolean;
  private image: ImageData | null = null;
  private pixels: Uint32Array | null = null;
  private depth: Float32Array | null = null;
  private owner: Int32Array | null = null;
  private basis: Basis | null = null;

  constructor(canvas: HTMLCanvasElement, options: { maxWidth: number; pickable?: boolean }) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw to a 2D canvas");
    this.canvas = canvas;
    this.ctx = ctx;
    this.maxWidth = options.maxWidth;
    this.pickable = !!options.pickable;
  }

  /** Matches the backing store to the canvas's CSS size; returns whether it changed. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const cap = isCoarsePointer() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const k = Math.min(1, this.maxWidth / (rect.width * cap));
    const width = Math.max(2, Math.round(rect.width * cap * k)), height = Math.max(2, Math.round(rect.height * cap * k));
    this.cssWidth = rect.width;
    this.dpr = width / rect.width;
    if (width === this.width && height === this.height) return false;
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    this.image = this.ctx.createImageData(width, height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.depth = new Float32Array(width * height);
    this.owner = this.pickable ? new Int32Array(width * height) : null;
    return true;
  }

  /** Recomputes the camera basis; call after moving the camera and before project(). */
  aim() {
    const c = this.camera, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    this.basis = {
      forward: [cp * sy, cp * cy, -sp],
      right: [cy, -sy, 0],
      up: [sy * sp, cy * sp, cp],
      eye: eyeOf(c),
      focal: Math.max(this.height, 2) / 2 / Math.tan(c.fov / 2),
    };
  }

  eye(): Vec3 | null {
    return this.basis ? this.basis.eye : null;
  }

  /** Ground metres per CSS pixel at the camera's target, for scale bars. */
  metresPerPixel() {
    return this.basis ? (this.camera.dist * this.dpr) / this.basis.focal : 0;
  }

  project(x: number, y: number, z: number): ScreenPoint | null {
    const b = this.basis;
    if (!b) return null;
    const dx = x - b.eye[0], dy = y - b.eye[1], dz = z - b.eye[2];
    const depth = dx * b.forward[0] + dy * b.forward[1] + dz * b.forward[2];
    if (depth < 2) return null;
    const k = b.focal / depth;
    return {
      x: (this.width / 2 + (dx * b.right[0] + dy * b.right[1]) * k) / this.dpr,
      y: (this.height / 2 - (dx * b.up[0] + dy * b.up[1] + dz * b.up[2]) * k) / this.dpr,
      depth,
    };
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = `rgb(${GROUND_RGB.join(",")})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Draws the cloud, then `overlay` in CSS pixels. Without a cloud yet, clears to the ground colour. */
  render(cloud: PointCloud | null, overlay?: (ctx: CanvasRenderingContext2D) => void) {
    if (!this.width) return;
    this.aim();
    const b = this.basis, pixels = this.pixels, depth = this.depth, image = this.image;
    if (!cloud || !b || !pixels || !depth || !image || this.fade <= 0) {
      this.clear();
    } else {
      const W = this.width, H = this.height, owner = this.owner;
      pixels.fill(GROUND);
      depth.fill(1e9);
      owner?.fill(-1);
      const [f0, f1, f2] = b.forward, [r0, r1] = b.right, [u0, u1, u2] = b.up, [e0, e1, e2] = b.eye;
      const focal = b.focal, hw = W / 2, hh = H / 2, mix = this.colourMix, splat = this.splat, fade = this.fade;
      const fogNear = this.camera.dist * 0.65, fogScale = 1 / (this.camera.dist * 2.8 - fogNear);
      const { x: X, y: Y, z: Z, cell } = cloud, { r: PR, g: PG, b: PB } = cloud.photo, { r: ER, g: EG, b: EB } = cloud.elevation;
      const [gr, gg, gb] = GROUND_RGB;
      for (let i = 0, n = cloud.count; i < n; i++) {
        const dx = X[i] - e0, dy = Y[i] - e1, dz = Z[i] - e2;
        const d = dx * f0 + dy * f1 + dz * f2;
        if (d < 2) continue;
        const k = focal / d;
        const sx = hw + (dx * r0 + dy * r1) * k;
        if (sx < -MAX_SPLAT || sx > W + MAX_SPLAT) continue;
        const sy = hh - (dx * u0 + dy * u1 + dz * u2) * k;
        if (sy < -MAX_SPLAT || sy > H + MAX_SPLAT) continue;
        const s = cell[i] * k * splat;
        const size = s < 1 ? 1 : s > MAX_SPLAT ? MAX_SPLAT : Math.ceil(s);
        let r = PR[i], g = PG[i], bl = PB[i];
        if (mix > 0) {
          r += (ER[i] - r) * mix;
          g += (EG[i] - g) * mix;
          bl += (EB[i] - bl) * mix;
        }
        let fog = (d - fogNear) * fogScale;
        fog = fog < 0 ? 0 : fog > 1 ? 1 : fog;
        const t = fade * (1 - fog * 0.85);
        const colour = (0xff000000 | ((gb + (bl - gb) * t) << 16) | ((gg + (g - gg) * t) << 8) | (gr + (r - gr) * t)) >>> 0;
        const x0 = (sx - size * 0.5) | 0, y0 = (sy - size * 0.5) | 0;
        const x1 = Math.min(W, x0 + size), y1 = Math.min(H, y0 + size);
        for (let yy = y0 < 0 ? 0 : y0; yy < y1; yy++) {
          const row = yy * W;
          for (let xx = x0 < 0 ? 0 : x0; xx < x1; xx++) {
            const at = row + xx;
            if (d < depth[at]) {
              depth[at] = d;
              pixels[at] = colour;
              if (owner) owner[at] = i;
            }
          }
        }
      }
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.putImageData(image, 0, 0);
    }
    if (overlay) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      overlay(this.ctx);
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  /** The index of the point drawn nearest a client position in the last render, or -1. */
  pick(clientX: number, clientY: number) {
    const owner = this.owner;
    if (!owner) return -1;
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * this.dpr, y = (clientY - rect.top) * this.dpr, reach = Math.round(6 * this.dpr);
    let best = -1, bestDistance = Infinity;
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const xx = (x + ox) | 0, yy = (y + oy) | 0;
        if (xx < 0 || yy < 0 || xx >= this.width || yy >= this.height) continue;
        const i = owner[yy * this.width + xx], distance = ox * ox + oy * oy;
        if (i >= 0 && distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
    }
    return best;
  }
}
