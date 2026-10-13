import { cameraAt, elevationMix, lookAheadOnNarrow, nearStage, posesFor, siteOpacity, type Camera, type Pose } from "@/lib/landing/descent";
import { gridProfile, heightOn, type SurveyGrid } from "@/lib/landing/grid";
import { lerp, smoothstep } from "@/lib/landing/math";
import type { Point3 } from "@/lib/landing/media";
import type { SceneFrame, SiteInfo } from "@/lib/landing/site";
import type { CloudView, ScreenPoint } from "../scene/CloudView";
import { accent, ink } from "../scene/draw";
import { drawGlobe, type GlobePlace } from "../scene/globe";
import type { Scene } from "../scene/jobs";

type Normalised = [number, number] | null;

const normalise = (view: CloudView, p: ScreenPoint | null): Normalised => (p ? [p.x / view.cssWidth, p.y / (view.height / view.dpr)] : null);

export const heroCamera = (frame: SceneFrame): Camera => ({ tx: frame.cx, ty: frame.cy, tz: (frame.ground + frame.low) / 2, yaw: 0.5, pitch: 0.62, dist: frame.radius * 1.49, fov: 0.82 });

/** The hero's orbit at heading `yaw`; returns the camera and ground metres per frame pixel for the scale bar. */
export function paintHero(view: CloudView, scene: Scene, yaw: number) {
  const start = heroCamera(scene.frame);
  Object.assign(view.camera, start, { yaw, dist: start.dist * (view.cssWidth < 700 ? 1.28 : 1) });
  view.render(scene.cloud);
  return { camera: { ...view.camera }, metresPerPixel: view.metresPerPixel() / view.dpr };
}

export type DescentPainter = { poses: Pose[]; outline: Point3[]; pileTop: number; place: GlobePlace; site: SiteInfo; scene: Scene };

const degrees = (v: number, positive: string, negative: string) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? positive : negative}`;

export const latLonText = (site: SiteInfo) => `LAT ${degrees(site.lat, "N", "S")} · LON ${degrees(site.lon, "E", "W")} · WGS 84`;

export function descentPainter(scene: Scene, site: SiteInfo): DescentPainter {
  const frame = scene.frame;
  let outline: Point3[] = [], pileTop = 0;
  if (site.featured) {
    outline = site.featured.outline.map(([x, y]) => {
      const z = scene.heightAt(x, y);
      return [x, y, (Number.isFinite(z) ? z : frame.ground) + 0.4];
    });
    const top = scene.heightAt(...site.featured.centre);
    pileTop = (Number.isFinite(top) ? top : frame.ground) + 3;
  }
  const place: GlobePlace = {
    name: site.name,
    detail: site.mode === "sample" ? `${site.surveyCount} SURVEYS · ${site.crs}` : `SURVEYED ${site.surveyDate.toUpperCase()} · ${site.crs}`,
    lat: site.lat,
    lon: site.lon,
    portfolio: site.mode === "sample",
  };
  return { poses: posesFor(frame), outline, pileTop, place, site, scene };
}

function tracePath(ctx: CanvasRenderingContext2D, points: ScreenPoint[], close: boolean) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

function drawDescentOverlays(view: CloudView, d: DescentPainter, s: number, ctx: CanvasRenderingContext2D) {
  const frame = d.scene.frame, outline = d.outline;
  const boundary = nearStage(s, 1) * smoothstep(0.8, 1, s);
  if (boundary > 0.01) {
    const [w, so, e, n] = frame.extent;
    const corners = [
      [w, so],
      [e, so],
      [e, n],
      [w, n],
    ].map(([x, y]) => view.project(x, y, frame.ground));
    if (corners.every(Boolean)) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = ink(0.6 * boundary);
      ctx.lineWidth = 1;
      tracePath(ctx, corners as ScreenPoint[], true);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  const measured = smoothstep(2.45, 2.75, s);
  if (measured <= 0.01 || outline.length < 3) return;
  const points = outline.map(([x, y, z]) => view.project(x, y, z));
  if (!points.every(Boolean)) return;
  const ring = points as ScreenPoint[], total = ring.length, drawn = smoothstep(2.5, 2.88, s) * total, whole = Math.floor(drawn);
  ctx.beginPath();
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let i = 1; i <= Math.min(whole, total); i++) ctx.lineTo(ring[i % total].x, ring[i % total].y);
  if (whole < total) {
    const a = ring[whole % total], b = ring[(whole + 1) % total], k = drawn - whole;
    ctx.lineTo(lerp(a.x, b.x, k), lerp(a.y, b.y, k));
  }
  ctx.strokeStyle = accent(measured);
  ctx.lineWidth = 1.8;
  ctx.stroke();
  if (drawn >= total - 0.001) {
    tracePath(ctx, ring, true);
    ctx.fillStyle = accent(0.16 * measured);
    ctx.fill();
  }
  ctx.fillStyle = ink(measured);
  const every = Math.max(1, Math.round(total / 12));
  for (let i = 0; i < Math.min(whole + 1, total); i += every) {
    ctx.beginPath();
    ctx.arc(ring[i].x, ring[i].y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The descent at stage position `s`, still (no drift, no pulse). Returns where the survey and pile
 * chips anchor, normalised to the frame, or null where they are hidden.
 */
export function paintDescent(view: CloudView, d: DescentPainter, s: number, globe: { landCount: number; sans: string; mono: string }) {
  const frame = d.scene.frame;
  cameraAt(s, 0, false, d.poses, view.camera);
  if (view.cssWidth < 760) lookAheadOnNarrow(view.camera, s);
  const mix = elevationMix(s);
  view.colourMix = mix;
  view.splat = lerp(1.25, 0.42, mix);
  view.fade = siteOpacity(s);
  view.render(d.scene.cloud);
  drawGlobe(view.ctx, { width: view.width, height: view.height, dpr: view.dpr, ...globe }, d.place, s, 0, false);
  view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawDescentOverlays(view, d, s, view.ctx);
  view.ctx.setTransform(1, 0, 0, 1, 0, 0);

  const survey = nearStage(s, 1) * smoothstep(0.85, 1, s);
  const pile = smoothstep(2.75, 2.95, s);
  const featured = d.site.featured;
  return {
    survey: survey > 0.01 ? normalise(view, view.project(frame.extent[0], frame.extent[3], frame.ground)) : null,
    pile: featured?.volume && pile > 0.01 && view.cssWidth >= 760 ? normalise(view, view.project(featured.centre[0], featured.centre[1], d.pileTop)) : null,
  };
}

export const TURNTABLE_YAW0 = 0.9;

/** The Try it view at heading `yaw`, coloured by photo or elevation; returns where each point lands. */
export function paintTurntable(view: CloudView, scene: Scene, yaw: number, elevation: boolean, points: Point3[]): Normalised[] {
  const f = scene.frame;
  Object.assign(view.camera, { tx: f.cx, ty: f.cy, tz: (f.ground + f.low) / 2, yaw, pitch: 0.62, dist: f.radius * 1.53, fov: 0.85 });
  view.colourMix = elevation ? 1 : 0;
  view.splat = elevation ? 0.45 : 1.25;
  view.render(scene.cloud);
  return points.map(([x, y, z]) => normalise(view, view.project(x, y, z + 0.4)));
}

type Node = { x: number; y: number; z: number; row: number; col: number };

function nodes(grid: SurveyGrid): Node[] {
  const out: Node[] = [];
  for (let row = 0; row < grid.ny; row++) {
    for (let col = 0; col < grid.nx; col++) {
      const z = grid.z[row * grid.nx + col];
      if (Number.isFinite(z)) out.push({ x: grid.x0 + (col + 0.5) * grid.cell, y: grid.y1 - (row + 0.5) * grid.cell, z, row, col });
    }
  }
  return out;
}

function inside([x, y]: [number, number], ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const point = (n: Node): Point3 => [n.x, n.y, n.z];

/** The steepest rise over at least `span` metres along the grid's rows and columns, low end first. */
function steepest(grid: SurveyGrid, span: number): [Point3, Point3] | null {
  const k = Math.max(1, Math.ceil(span / grid.cell)), run = k * grid.cell;
  let best: [Point3, Point3] | null = null, bestGrade = -1;
  const at = (row: number, col: number) => grid.z[row * grid.nx + col];
  const xy = (row: number, col: number): [number, number] => [grid.x0 + (col + 0.5) * grid.cell, grid.y1 - (row + 0.5) * grid.cell];
  for (let row = 0; row < grid.ny; row++) {
    for (let col = 0; col < grid.nx; col++) {
      const z = at(row, col);
      if (!Number.isFinite(z)) continue;
      for (const [r2, c2] of [
        [row, col + k],
        [row + k, col],
      ]) {
        if (r2 >= grid.ny || c2 >= grid.nx) continue;
        const z2 = at(r2, c2);
        if (!Number.isFinite(z2)) continue;
        const grade = Math.abs(z2 - z) / run;
        if (grade <= bestGrade) continue;
        bestGrade = grade;
        const a: Point3 = [...xy(row, col), z], b: Point3 = [...xy(r2, c2), z2];
        best = z <= z2 ? [a, b] : [b, a];
      }
    }
  }
  return best;
}

/** Three measurements to show on the turntable, picked from the survey's own ground. */
export function pickPresets(scene: Scene, site: SiteInfo): { name: string; a: Point3; b: Point3 }[] {
  const grid = scene.survey?.grid;
  if (!grid) throw new Error("presets need the survey's grid");
  const all = nodes(grid), presets: { name: string; a: Point3; b: Point3 }[] = [];
  const featured = site.featured;
  if (featured && featured.outline.length > 2) {
    const ring = featured.outline;
    const rim = ring
      .map(([x, y]) => [x, y, heightOn(grid, x, y)] as Point3)
      .filter((p) => Number.isFinite(p[2]))
      .sort((p, q) => p[2] - q[2])[0];
    const top = all.filter((n) => inside([n.x, n.y], ring)).sort((p, q) => q.z - p.z)[0];
    if (rim && top) presets.push({ name: `${featured.name} height`, a: rim, b: point(top) });
  } else if (all.length) {
    let lo = all[0], hi = all[0];
    for (const n of all) {
      if (n.z < lo.z) lo = n;
      if (n.z > hi.z) hi = n;
    }
    presets.push({ name: "Lowest to highest point", a: point(lo), b: point(hi) });
  }
  // Over a shorter run the steepest pair is a tree or a pit wall a few metres across, too small to see on the turntable.
  const slope = steepest(grid, 100);
  if (slope) presets.push({ name: "Steepest 100 m slope", a: slope[0], b: slope[1] });
  const y = featured?.centre[1] ?? scene.frame.cy, profile = gridProfile(grid, y, grid.cell);
  if (profile.length > 1) {
    const [d0, z0] = profile[0], [d1, z1] = profile[profile.length - 1];
    presets.push({ name: "Across the site", a: [grid.x0 + d0, y, z0], b: [grid.x0 + d1, y, z1] });
  }
  return presets;
}
