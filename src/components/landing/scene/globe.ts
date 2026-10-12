import { globeOpacity } from "@/lib/landing/descent";
import { lerp, smoothstep } from "@/lib/landing/math";
import { valueNoise3 } from "@/lib/landing/noise";
import { accent, ink, MUTED } from "./draw";

const DEG = Math.PI / 180;

type Pin = { name: string; vector: [number, number, number] };

const toVector = (lat: number, lon: number): [number, number, number] => [
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
];

const PORTFOLIO: Pin[] = [
  { name: "Pilbara", lat: -22.6, lon: 117.8 },
  { name: "Bowen Basin", lat: -22.0, lon: 148.1 },
  { name: "Atacama", lat: -24.2, lon: -69.1 },
  { name: "Sudbury", lat: 46.5, lon: -81.0 },
  { name: "Rajasthan", lat: 24.6, lon: 73.7 },
].map((s) => ({ name: s.name, vector: toVector(s.lat, s.lon) }));

let land: Float32Array | null = null;
let graticule: Float32Array | null = null;

/** Evenly spread points on the sphere, kept where 3D noise says land. */
function landPoints(count: number) {
  if (land) return land;
  const points: number[] = [], golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count, r = Math.sqrt(1 - y * y), phi = i * golden;
    const x = Math.cos(phi) * r, z = Math.sin(phi) * r;
    let sum = 0, amp = 1, freq = 1.4, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * valueNoise3(x * freq + 10, y * freq + 20, z * freq + 30);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    if (sum / norm > 0.53) points.push(x, y, z);
  }
  land = Float32Array.from(points);
  return land;
}

function graticulePoints() {
  if (graticule) return graticule;
  const points: number[] = [];
  for (let lat = -75; lat <= 75; lat += 15) for (let lon = 0; lon < 360; lon += 3) points.push(...toVector(lat, lon));
  for (let lon = 0; lon < 360; lon += 15) for (let lat = -87; lat <= 87; lat += 3) points.push(...toVector(lat, lon));
  graticule = Float32Array.from(points);
  return graticule;
}

export type GlobeFrame = { width: number; height: number; dpr: number; landCount: number; sans: string; mono: string };

/** The site the globe zooms into. `portfolio` adds the illustrative pins for other sites. */
export type GlobePlace = { name: string; detail: string; lat: number; lon: number; portfolio: boolean };

/**
 * Draws the portfolio globe at stage position `s` in device pixels: the sites at rest at 0, then a
 * zoom into the main site that hands over to the terrain as `s` reaches 1.
 */
export function drawGlobe(ctx: CanvasRenderingContext2D, frame: GlobeFrame, place: GlobePlace, s: number, time: number, motion: boolean) {
  const alpha = globeOpacity(s);
  if (alpha <= 0.005) return;
  const { width: W, height: H, dpr } = frame, narrow = W / dpr < 760;
  const zoom = Math.exp(Math.log(90) * Math.pow(smoothstep(0.06, 1, s), 1.5));
  const R = Math.min(W, H) * (narrow ? 0.36 : 0.34) * zoom;
  const cx = W * lerp(narrow ? 0.5 : 0.63, 0.5, smoothstep(0, 0.8, s));
  const cy = H * lerp(narrow ? 0.62 : 0.52, 0.5, smoothstep(0, 0.8, s));
  const main: Pin = { name: place.name, vector: toVector(place.lat, place.lon) };
  const pins = place.portfolio ? [main, ...PORTFOLIO] : [main];
  const lat0 = place.lat * DEG;
  const lon0 = (place.lon + (1 - smoothstep(0, 0.75, s)) * 55 + (motion ? Math.sin(time * 0.07) * 4 * (1 - s) : 0)) * DEG;
  const ca = Math.cos(-lon0), sa = Math.sin(-lon0), cb = Math.cos(lat0), sb = Math.sin(lat0);
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const z1 = -x * sa + z * ca;
    return [cx + (x * ca + z * sa) * R, cy - (y * cb - z1 * sb) * R, y * sb + z1 * cb];
  };

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  if (R < Math.max(W, H) * 3) {
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.12);
    g.addColorStop(0, "rgba(48,38,28,0.96)");
    g.addColorStop(0.86, "rgba(22,18,14,0.96)");
    g.addColorStop(0.895, accent(0.2));
    g.addColorStop(1, accent(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(30,24,18,0.94)";
    ctx.fillRect(0, 0, W, H);
  }

  if (zoom < 10) {
    const grid = graticulePoints(), size = 1.1 * dpr;
    ctx.fillStyle = ink(0.12);
    for (let i = 0; i < grid.length; i += 3) {
      const [px, py, depth] = project(grid[i], grid[i + 1], grid[i + 2]);
      if (depth > 0) ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }

  const points = landPoints(frame.landCount), size = Math.min(4, 1.7 * Math.sqrt(zoom)) * dpr;
  const buckets: number[][] = [[], [], [], []];
  for (let i = 0; i < points.length; i += 3) {
    const [px, py, depth] = project(points[i], points[i + 1], points[i + 2]);
    if (depth <= 0 || px < -6 || py < -6 || px > W + 6 || py > H + 6) continue;
    buckets[Math.min(3, (depth * 4) | 0)].push(px, py);
  }
  [0.24, 0.4, 0.6, 0.8].forEach((a, b) => {
    ctx.fillStyle = ink(a);
    const bucket = buckets[b];
    for (let i = 0; i < bucket.length; i += 2) ctx.fillRect(bucket[i] - size / 2, bucket[i + 1] - size / 2, size, size);
  });

  const othersAlpha = 1 - smoothstep(0.2, 0.4, s), mainLabelAlpha = 1 - smoothstep(0.55, 0.8, s);
  for (const site of pins) {
    const [px, py, depth] = project(...site.vector);
    if (depth < 0.05) continue;
    if (site === main) {
      const phase = motion ? (time * 0.6) % 1 : 0.4;
      ctx.strokeStyle = accent((1 - phase) * 0.85);
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, (5 + 16 * phase) * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = accent();
      ctx.beginPath();
      ctx.arc(px, py, 3.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (mainLabelAlpha > 0.01) {
        ctx.globalAlpha = alpha * mainLabelAlpha;
        ctx.fillStyle = ink();
        ctx.font = `500 ${13 * dpr}px ${frame.sans}`;
        ctx.fillText(site.name, px + 14 * dpr, py - 2 * dpr);
        ctx.fillStyle = MUTED;
        ctx.font = `${11 * dpr}px ${frame.mono}`;
        ctx.fillText(place.detail, px + 14 * dpr, py + 13 * dpr);
        ctx.globalAlpha = alpha;
      }
    } else if (othersAlpha > 0.01) {
      ctx.globalAlpha = alpha * othersAlpha;
      ctx.fillStyle = ink();
      ctx.beginPath();
      ctx.arc(px, py, 2.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = MUTED;
      ctx.font = `${10.5 * dpr}px ${frame.mono}`;
      ctx.fillText(site.name.toUpperCase(), px + 8 * dpr, py + 4 * dpr);
      ctx.globalAlpha = alpha;
    }
  }
  ctx.restore();
}
