"use client";

import { useEffect, useRef } from "react";
import type { PointCloud } from "@/lib/landing/cloud";
import { altitudeOf, eyeOf, type Camera } from "@/lib/landing/descent";
import { formatEastNorth, formatHeading, formatNumber } from "@/lib/landing/format";
import { SAMPLE_FRAME, type SceneFrame, type SiteInfo } from "@/lib/landing/site";
import styles from "./landing.module.css";
import { CloudView } from "./scene/CloudView";
import { isCoarsePointer, prefersReducedMotion, watchVisibility } from "./scene/env";
import { loadScene } from "./scene/jobs";
import { useSite } from "./SiteContext";

const SCALES = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

const heroCamera = (frame: SceneFrame): Camera => ({ tx: frame.cx, ty: frame.cy, tz: (frame.ground + frame.low) / 2, yaw: 0.5, pitch: 0.62, dist: frame.radius * 1.49, fov: 0.82 });

const positionText = (cam: Camera, site: SiteInfo) => {
  const [x, y] = eyeOf(cam);
  return formatEastNorth(x, y, site.origin);
};
const altitudeText = (cam: Camera, ground: number, site: SiteInfo) =>
  `ALT ${formatNumber(altitudeOf(cam, ground))} m · HDG ${formatHeading(cam.yaw)} · ${site.surveyDate.toUpperCase()}`;

/** The hero's slow orbit over the site, with the instrument readouts that follow the camera. */
export function HeroScene() {
  const site = useSite();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef<HTMLDivElement>(null);
  const altitudeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const barLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    const view = new CloudView(canvas, { maxWidth: 1600 });
    const motion = !prefersReducedMotion();
    let start = heroCamera(SAMPLE_FRAME), ground = SAMPLE_FRAME.ground;
    let cloud: PointCloud | null = null, visible = false, dirty = true, alive = true;
    let elapsed = 0, sinceDraw = 1, sinceHud = 1, last = performance.now(), raf = 0;
    let pointerX = 0, pointerY = 0, easedX = 0, easedY = 0;

    loadScene(site).then(
      (scene) => {
        if (!alive) return;
        start = heroCamera(scene.frame);
        ground = scene.frame.ground;
        Object.assign(view.camera, start);
        cloud = scene.cloud;
        dirty = true;
      },
      () => {},
    );

    const updateHud = () => {
      const cam = view.camera;
      if (positionRef.current) positionRef.current.textContent = positionText(cam, site);
      if (altitudeRef.current) altitudeRef.current.textContent = altitudeText(cam, ground, site);
      const mpp = view.metresPerPixel();
      const metres = SCALES.find((m) => m / mpp >= 70) ?? SCALES[SCALES.length - 1];
      if (barRef.current && mpp > 0) barRef.current.style.width = `${(metres / mpp).toFixed(1)}px`;
      if (barLabelRef.current) barLabelRef.current.textContent = `${metres} m`;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || !cloud) return;
      view.camera.dist = start.dist * (view.cssWidth < 700 ? 1.28 : 1);
      if (motion) {
        elapsed += dt;
        sinceDraw += dt;
        sinceHud += dt;
        easedX += (pointerX - easedX) * Math.min(1, dt * 3);
        easedY += (pointerY - easedY) * Math.min(1, dt * 3);
        view.camera.yaw = start.yaw + elapsed * 0.035 + easedX * 0.3;
        view.camera.pitch = start.pitch - easedY * 0.1;
      }
      if (!dirty && (!motion || sinceDraw < 1 / 30)) return;
      dirty = false;
      sinceDraw = 0;
      view.render(cloud);
      canvas.dataset.ready = "";
      if (!motion || sinceHud > 0.1) {
        sinceHud = 0;
        updateHud();
      }
    };

    const onPointer = (e: PointerEvent) => {
      const rect = frame.getBoundingClientRect();
      pointerX = (e.clientX - rect.left) / rect.width - 0.5;
      pointerY = (e.clientY - rect.top) / rect.height - 0.5;
    };
    const onLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };
    if (motion && !isCoarsePointer()) {
      frame.addEventListener("pointermove", onPointer);
      frame.addEventListener("pointerleave", onLeave);
    }

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
      frame.removeEventListener("pointermove", onPointer);
      frame.removeEventListener("pointerleave", onLeave);
    };
  }, [site]);

  const initial = site.mode === "sample" ? heroCamera(SAMPLE_FRAME) : null;
  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className={`${styles.layer} ${styles.sceneCanvas}`} />
      <div aria-hidden="true" className={`${styles.layer} ${styles.heroScrim}`} />
      <div aria-hidden="true" className={`${styles.layer} ${styles.hud}`}>
        <span className={`${styles.corner} ${styles.cornerTl}`} />
        <span className={`${styles.corner} ${styles.cornerTr}`} />
        <span className={`${styles.corner} ${styles.cornerBl}`} />
        <span className={`${styles.corner} ${styles.cornerBr}`} />
        <span className={styles.reticle} />
        <div className={styles.hudSite}>
          <div>
            {site.mode === "sample" ? "SAMPLE SITE" : "SURVEY"} · {site.name.toUpperCase()}
          </div>
          <div className={styles.hudDim}>
            {site.mode === "sample" ? `SURVEY ${site.surveyCount}` : `SURVEYED ${site.surveyDate.toUpperCase()}`} · {site.crs}
          </div>
        </div>
        <div className={styles.hudRead}>
          <div className={styles.scalebar}>
            <i ref={barRef} />
            <span ref={barLabelRef}>100 m</span>
          </div>
          <div ref={positionRef}>{initial ? positionText(initial, site) : formatEastNorth(0, 0, site.origin)}</div>
          <div ref={altitudeRef}>{initial ? altitudeText(initial, SAMPLE_FRAME.ground, site) : `ALT – · ${site.surveyDate.toUpperCase()}`}</div>
        </div>
      </div>
    </>
  );
}
