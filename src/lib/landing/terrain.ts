import { clamp, lerp, smoothstep } from "./math.ts";
import { fbm, valueNoise } from "./noise.ts";

/**
 * The landing page's sample site, an invented quarry generated from noise so every picture and
 * figure on the page comes from one consistent piece of ground. Coordinates are metres east (x)
 * and north (y) of ORIGIN; heights are metres.
 */
export const SITE_NAME = "Kestrel Ridge Quarry";
export const CRS = "EPSG:28356";
export const ORIGIN = { east: 334_000, north: 6_413_000 } as const;
export const SURVEY_DATE = "18 Sep 2026";
export const EARLIER_SURVEY_DATE = "21 Aug 2026";
export const SURVEY_COUNT = 14;

/** Half-width of the surveyed square; the dimmer basemap around it reaches BASEMAP_EXTENT. */
export const EXTENT = 430;
export const BASEMAP_EXTENT = 1100;
export const RIM = 44;

export const PIT = { x: -70, y: 30, radius: 230, floorRadius: 55, depth: 72, benches: 8, rampHeading: -0.45 } as const;
export const PAD = { x0: 135, x1: 340, y0: -275, y1: 15, level: 46 } as const;

export type Pile = { x: number; y: number; radius: number; height: number; stretchX: number; stretchY: number; rotation: number; colour: readonly [number, number, number] };

export const PILES: readonly Pile[] = [
  { x: 215, y: -135, radius: 40, height: 15, stretchX: 1.25, stretchY: 0.85, rotation: 0.5, colour: [150, 145, 136] },
  { x: 275, y: -50, radius: 26, height: 10, stretchX: 1, stretchY: 1, rotation: 0, colour: [160, 108, 78] },
  { x: 178, y: -225, radius: 22, height: 8, stretchX: 1.4, stretchY: 0.8, rotation: -0.3, colour: [178, 166, 146] },
  { x: 292, y: -185, radius: 17, height: 6, stretchX: 1, stretchY: 1, rotation: 0, colour: [122, 120, 114] },
];

/** Stockpile 1's height in the earlier survey, as a share of its height now. */
export const EARLIER_PILE_SCALE = 0.62;

export const Material = { Natural: 0, Disturbed: 1, BenchFace: 2, Stockpile: 3, Water: 4, Road: 5 } as const;
export type Material = (typeof Material)[keyof typeof Material];

const RAMP_TOP = { x: PIT.x + PIT.radius * Math.cos(PIT.rampHeading), y: PIT.y + PIT.radius * Math.sin(PIT.rampHeading) };
const ROADS: readonly (readonly [number, number, number, number])[] = [
  [RAMP_TOP.x, RAMP_TOP.y, 165, -40],
  [320, -260, 400, -420],
  [120, 10, -40, 330],
];

function segmentDistance(px: number, py: number, [ax, ay, bx, by]: readonly [number, number, number, number]) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function pileHeight(p: Pile, x: number, y: number, scale = 1) {
  const dx = x - p.x, dy = y - p.y, c = Math.cos(p.rotation), s = Math.sin(p.rotation);
  const u = (dx * c + dy * s) / (p.radius * p.stretchX), v = (-dx * s + dy * c) / (p.radius * p.stretchY);
  const q = Math.hypot(u, v);
  if (q >= 1) return 0;
  return p.height * scale * Math.pow(1 - Math.pow(q, 1.35), 1.05) * (0.95 + 0.1 * valueNoise(x / 5, y / 5));
}

export type Sample = { z: number; material: Material; pile: number };

const scratch: Sample = { z: 0, material: Material.Natural, pile: -1 };

/**
 * The ground at (x, y). The returned object is reused by the next call, so read it before sampling
 * again. `firstPileScale` scales Stockpile 1, which is how the earlier survey is drawn.
 */
export function sample(x: number, y: number, firstPileScale = 1): Sample {
  let z = RIM + (fbm(x / 230, y / 230, 4) - 0.5) * 28 + (fbm(x / 38, y / 38, 3) - 0.5) * 2.4;
  let material: Material = Material.Natural;
  let pile = -1;

  const padInside = Math.min(x - PAD.x0, PAD.x1 - x, y - PAD.y0, PAD.y1 - y);
  z = lerp(z, PAD.level, smoothstep(-30, 6, padInside));
  if (padInside > 0) material = Material.Disturbed;

  const dx = x - PIT.x, dy = y - PIT.y, r = Math.hypot(dx, dy), heading = Math.atan2(dy, dx);
  const rr = r / (1 + 0.18 * (valueNoise(Math.cos(heading) * 1.7 + 7, Math.sin(heading) * 1.7 + 3) - 0.5));
  z = lerp(z, RIM, smoothstep(PIT.radius + 70, PIT.radius, rr));
  if (rr < PIT.radius + 8) material = Material.Disturbed;
  if (rr < PIT.radius) {
    const t = clamp((PIT.radius - rr) / (PIT.radius - PIT.floorRadius), 0, 1);
    const bench = Math.min(Math.floor(t * PIT.benches), PIT.benches);
    const within = t * PIT.benches - bench;
    const steps = bench >= PIT.benches ? PIT.benches : bench + smoothstep(0.58, 1, within);
    const fromRamp = Math.atan2(Math.sin(heading - PIT.rampHeading), Math.cos(heading - PIT.rampHeading));
    const onRamp = Math.cos(fromRamp) > 0 ? 1 - smoothstep(9, 14, Math.abs(Math.sin(fromRamp)) * r) : 0;
    z -= lerp((steps / PIT.benches) * PIT.depth, t * PIT.depth, onRamp);
    material = onRamp > 0.5 ? Material.Road : bench < PIT.benches && within > 0.58 ? Material.BenchFace : Material.Disturbed;
    if (t >= 1 && Math.hypot(x - PIT.x - 12, y - PIT.y + 8) < 28 + 6 * valueNoise(x / 9, y / 9)) {
      material = Material.Water;
      z = RIM - PIT.depth - 0.6;
    }
  }

  for (const road of ROADS) if (material !== Material.BenchFace && segmentDistance(x, y, road) < 7) material = Material.Road;

  for (let i = 0; i < PILES.length; i++) {
    const h = pileHeight(PILES[i], x, y, i === 0 ? firstPileScale : 1);
    if (h > 0.05) {
      z += h;
      pile = i;
      material = Material.Stockpile;
    }
  }

  scratch.z = z;
  scratch.material = material;
  scratch.pile = pile;
  return scratch;
}

export type Rgb = [number, number, number];

/** What the orthophoto would show at (x, y), before hillshading. */
export function groundColour(x: number, y: number, material: Material, pile: number, out: Rgb): Rgb {
  let r: number, g: number, b: number;
  switch (material) {
    case Material.Natural: {
      const scrub = smoothstep(0.5, 0.68, fbm(x / 70 + 11, y / 70 - 4, 3));
      r = lerp(176, 92, scrub);
      g = lerp(152, 92, scrub);
      b = lerp(112, 62, scrub);
      break;
    }
    case Material.Disturbed:
      [r, g, b] = [184, 170, 150];
      break;
    case Material.BenchFace:
      [r, g, b] = [126, 110, 96];
      break;
    case Material.Stockpile:
      [r, g, b] = PILES[pile].colour;
      break;
    case Material.Water:
      [r, g, b] = [46, 60, 64];
      break;
    default:
      [r, g, b] = [206, 194, 172];
  }
  const grain = 1 + (valueNoise(x * 0.45, y * 0.45) * 0.18 - 0.09) * (material === Material.Water ? 0.2 : 1);
  out[0] = r * grain;
  out[1] = g * grain;
  out[2] = b * grain;
  return out;
}

const LIGHT = (() => {
  const v = [-0.55, 0.62, 0.72], m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m] as const;
})();

/** Hillshade for a surface with the given slopes, lit from the north-west; 1 is roughly a flat surface. */
export function shade(dzdx: number, dzdy: number) {
  const m = Math.hypot(dzdx, dzdy, 1);
  return clamp(0.38 + (0.9 * (-dzdx * LIGHT[0] - dzdy * LIGHT[1] + LIGHT[2])) / m, 0.36, 1.25);
}

export const ELEVATION_RAMP: readonly (readonly [number, number, number, number])[] = [
  [0, 40, 62, 92],
  [0.3, 86, 116, 150],
  [0.55, 168, 150, 120],
  [0.75, 216, 128, 80],
  [1, 246, 226, 200],
];

export function rampColour(t: number, out: Rgb): Rgb {
  const v = clamp(t, 0, 1);
  for (let i = 1; i < ELEVATION_RAMP.length; i++) {
    const a = ELEVATION_RAMP[i - 1], b = ELEVATION_RAMP[i];
    if (v <= b[0]) {
      const k = (v - a[0]) / (b[0] - a[0]);
      out[0] = lerp(a[1], b[1], k);
      out[1] = lerp(a[2], b[2], k);
      out[2] = lerp(a[3], b[3], k);
      return out;
    }
  }
  return out;
}

/** Volume (m³) and footprint (m²) of a stockpile above the ground it sits on. */
export function pileStats(pile: Pile = PILES[0], scale = 1, step = 0.5) {
  const reach = pile.radius * Math.max(pile.stretchX, pile.stretchY);
  let volume = 0, footprint = 0;
  for (let y = pile.y - reach; y <= pile.y + reach; y += step) {
    for (let x = pile.x - reach; x <= pile.x + reach; x += step) {
      const h = pileHeight(pile, x, y, scale);
      if (h > 0.02) {
        volume += h * step * step;
        footprint += step * step;
      }
    }
  }
  return { volume, footprint };
}

/** The measurement boundary drawn around a stockpile, just outside its toe, with ground heights. */
export function pileOutline(pile: Pile = PILES[0], count = 48, margin = 1.08): [number, number, number][] {
  const c = Math.cos(pile.rotation), s = Math.sin(pile.rotation), out: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const u = margin * Math.cos(a) * pile.radius * pile.stretchX, v = margin * Math.sin(a) * pile.radius * pile.stretchY;
    const x = pile.x + u * c - v * s, y = pile.y + u * s + v * c;
    out.push([x, y, sample(x, y).z + 0.4]);
  }
  return out;
}

/** The pad's design surface: a plane graded about 1% to the east. */
export const designLevel = (x: number, y: number) => 45.2 + 0.011 * (x - PAD.x0) - 0.004 * (y + 130);

/** Cut and fill (m³) of the pad against its design surface, on a `step`-metre grid. */
export function cutFillTotals(step = 1) {
  let cut = 0, fill = 0;
  for (let x = PAD.x0 + step / 2; x < PAD.x1; x += step) {
    for (let y = PAD.y0 + step / 2; y < PAD.y1; y += step) {
      const diff = sample(x, y).z - designLevel(x, y);
      if (diff > 0) cut += diff * step * step;
      else fill -= diff * step * step;
    }
  }
  return { cut, fill };
}
