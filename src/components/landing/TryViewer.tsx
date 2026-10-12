"use client";

import { useEffect, useRef } from "react";
import type { PointCloud } from "@/lib/landing/cloud";
import { formatEastNorth, formatNumber } from "@/lib/landing/format";
import { clamp } from "@/lib/landing/math";
import styles from "./landing.module.css";
import { CloudView } from "./scene/CloudView";
import { accent, ink } from "./scene/draw";
import { cssFont, prefersReducedMotion, watchVisibility } from "./scene/env";
import { loadScene } from "./scene/jobs";
import { useSite } from "./SiteContext";


type Point = [number, number, number];

/** The sample site to orbit and measure: drag turns it, a click drops a point, and two points give a distance. */
export function TryViewer() {
  const site = useSite();
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = frameRef.current, canvas = frame?.querySelector("canvas");
    if (!frame || !canvas) return;
    const find = <T extends HTMLElement>(name: string) => frame.querySelector<T>(`[data-part="${name}"]`);
    const title = find("title"), d3 = find("distance"), dh = find("horizontal"), dz = find("height"), grade = find("grade");
    const photo = find<HTMLButtonElement>("photo"), elevation = find<HTMLButtonElement>("elevation");

    const view = new CloudView(canvas, { maxWidth: 1500, pickable: true });
    let nearest = 260, farthest = 1400;
    let mono = cssFont(frame, "--font-mono", "monospace");
    let cloud: PointCloud | null = null, visible = false, dirty = true, alive = true, spinning = !prefersReducedMotion();
    let last = performance.now(), sinceDraw = 1, raf = 0;
    const picks: Point[] = [];

    loadScene(site).then(
      (scene) => {
        if (!alive) return;
        const f = scene.frame;
        Object.assign(view.camera, { tx: f.cx, ty: f.cy, tz: (f.ground + f.low) / 2, yaw: 0.9, pitch: 0.62, dist: f.radius * 1.53, fov: 0.85 });
        nearest = f.radius * 0.6;
        farthest = f.radius * 3.3;
        cloud = scene.cloud;
        dirty = true;
      },
      () => {},
    );
    document.fonts?.ready.then(() => {
      mono = cssFont(frame, "--font-mono", "monospace");
      dirty = true;
    });

    const blank = () => [d3, dh, dz, grade].forEach((el) => el && (el.textContent = "–"));
    const updateReadout = () => {
      if (!title) return;
      if (!picks.length) {
        title.textContent = "Click a point on the ground to start.";
        return blank();
      }
      const [a, b] = picks;
      if (!b) {
        title.textContent = `A: ${formatEastNorth(a[0], a[1], site.origin)} · Z ${formatNumber(a[2], 1)} m. Now click B.`;
        return blank();
      }
      const horizontal = Math.hypot(b[0] - a[0], b[1] - a[1]), rise = b[2] - a[2];
      title.textContent = `A to B on the ${site.surveyDate} survey.`;
      if (d3) d3.textContent = `${formatNumber(Math.hypot(horizontal, rise), 1)} m`;
      if (dh) dh.textContent = `${formatNumber(horizontal, 1)} m`;
      if (dz) dz.textContent = `${rise >= 0 ? "+" : "−"}${formatNumber(Math.abs(rise), 1)} m`;
      if (grade) grade.textContent = horizontal > 0.05 ? `${formatNumber((Math.abs(rise) / horizontal) * 100, 1)}%` : "–";
    };

    const overlay = (ctx: CanvasRenderingContext2D) => {
      const points = picks.map(([x, y, z]) => view.project(x, y, z + 0.4));
      const [a, b] = points;
      if (a && b) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = ink(0.95);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const [p, q] = picks, label = `${formatNumber(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), 1)} m`;
        ctx.font = `500 12px ${mono}`;
        const w = ctx.measureText(label).width + 16, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 18;
        ctx.fillStyle = "rgba(10,9,8,0.82)";
        ctx.strokeStyle = accent(0.85);
        ctx.beginPath();
        ctx.roundRect(mx - w / 2, my - 12, w, 24, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ink();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, mx, my + 1);
        ctx.textAlign = "start";
        ctx.textBaseline = "alphabetic";
      }
      points.forEach((pt, i) => {
        if (!pt) return;
        ctx.strokeStyle = accent();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ink();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `500 11px ${mono}`;
        ctx.fillText(i ? "B" : "A", pt.x + 10, pt.y - 8);
      });
    };

    const stopSpinning = () => {
      spinning = false;
    };
    const pick = (clientX: number, clientY: number) => {
      const i = view.pick(clientX, clientY);
      if (i < 0 || !cloud) return;
      stopSpinning();
      if (picks.length >= 2) picks.length = 0;
      picks.push([cloud.x[i], cloud.y[i], cloud.z[i]]);
      updateReadout();
      dirty = true;
    };

    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, yaw: view.camera.yaw, pitch: view.camera.pitch, moved: false };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        stopSpinning();
      }
      if (!drag.moved) return;
      view.camera.yaw = drag.yaw - dx * 0.006;
      if (e.pointerType !== "touch") view.camera.pitch = clamp(drag.pitch + dy * 0.004, 0.22, 1.5);
      dirty = true;
    };
    const onUp = (e: PointerEvent) => {
      if (drag && !drag.moved) pick(e.clientX, e.clientY);
      drag = null;
    };
    const onCancel = () => {
      drag = null;
    };
    const zoom = (factor: number) => {
      view.camera.dist = clamp(view.camera.dist * factor, nearest, farthest);
      stopSpinning();
      dirty = true;
    };
    const onKey = (e: KeyboardEvent) => {
      const cam = view.camera;
      if (e.key === "ArrowLeft") cam.yaw += 0.08;
      else if (e.key === "ArrowRight") cam.yaw -= 0.08;
      else if (e.key === "ArrowUp") cam.pitch = clamp(cam.pitch + 0.06, 0.22, 1.5);
      else if (e.key === "ArrowDown") cam.pitch = clamp(cam.pitch - 0.06, 0.22, 1.5);
      else if (e.key === "+" || e.key === "=") return zoom(0.82);
      else if (e.key === "-" || e.key === "_") return zoom(1 / 0.82);
      else return;
      e.preventDefault();
      stopSpinning();
      dirty = true;
    };
    const setColour = (byElevation: boolean) => {
      view.colourMix = byElevation ? 1 : 0;
      view.splat = byElevation ? 0.45 : 1.25;
      photo?.setAttribute("aria-pressed", String(!byElevation));
      elevation?.setAttribute("aria-pressed", String(byElevation));
      dirty = true;
    };
    const onClick = (e: MouseEvent) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "photo") setColour(false);
      else if (action === "elevation") setColour(true);
      else if (action === "zoom-in") zoom(0.8);
      else if (action === "zoom-out") zoom(1 / 0.8);
      else if (action === "clear") {
        picks.length = 0;
        updateReadout();
        dirty = true;
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("keydown", onKey);
    frame.addEventListener("click", onClick);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || !cloud) return;
      if (spinning) {
        view.camera.yaw += dt * 0.04;
        sinceDraw += dt;
        if (sinceDraw > 1 / 30) dirty = true;
      }
      if (!dirty) return;
      dirty = false;
      sinceDraw = 0;
      view.render(cloud, overlay);
      canvas.dataset.ready = "";
    };

    const stopWatching = watchVisibility(frame, (v) => {
      visible = v;
      if (v) {
        view.resize();
        dirty = true;
      }
    });
    const resizer = new ResizeObserver(() => {
      view.resize();
      dirty = true;
    });
    resizer.observe(canvas);
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopWatching();
      resizer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("keydown", onKey);
      frame.removeEventListener("click", onClick);
    };
  }, [site]);

  return (
    <section id="try" aria-labelledby="try-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Try it</span>
        <h2 id="try-title" className={styles.sectionTitle}>
          {site.mode === "sample" ? "Measure the sample site yourself." : `Measure ${site.name} yourself.`}
        </h2>
        <p>Drag to orbit. Click two points on the ground to measure between them.</p>
      </div>
      <div ref={frameRef} className={`${styles.window} ${styles.tryWindow}`}>
        <canvas
          tabIndex={0}
          aria-label="Sample site in 3D. Drag or use the arrow keys to orbit, plus and minus to zoom, and click the ground to measure."
          className={`${styles.layer} ${styles.sceneCanvas} ${styles.tryCanvas}`}
        />
        <div className={styles.tryControls}>
          <div role="group" aria-label="Colour points by" className={styles.segmented}>
            <button type="button" data-part="photo" data-action="photo" aria-pressed="true">
              Photo
            </button>
            <button type="button" data-part="elevation" data-action="elevation" aria-pressed="false">
              Elevation
            </button>
          </div>
          <div className={styles.tryTools}>
            <button type="button" data-action="zoom-in" aria-label="Zoom in" className={styles.roundButton}>
              +
            </button>
            <button type="button" data-action="zoom-out" aria-label="Zoom out" className={styles.roundButton}>
              −
            </button>
            <button type="button" data-action="clear" className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}>
              Clear
            </button>
          </div>
        </div>
        <div aria-live="polite" className={styles.readout}>
          <p data-part="title" className={styles.readoutTitle}>
            Click a point on the ground to start.
          </p>
          <dl>
            <div>
              <dt>Distance</dt>
              <dd data-part="distance">–</dd>
            </div>
            <div>
              <dt>Horizontal</dt>
              <dd data-part="horizontal">–</dd>
            </div>
            <div>
              <dt>Height change</dt>
              <dd data-part="height">–</dd>
            </div>
            <div>
              <dt>Grade</dt>
              <dd data-part="grade">–</dd>
            </div>
          </dl>
        </div>
        <span aria-hidden="true" className={styles.hint}>
          Drag to orbit · Click to measure
        </span>
      </div>
    </section>
  );
}
