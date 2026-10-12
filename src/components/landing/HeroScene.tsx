"use client";

import { useEffect, useRef } from "react";
import type { PointCloud } from "@/lib/landing/cloud";
import { altitudeOf, eyeOf, type Camera } from "@/lib/landing/descent";
import { formatEastNorth, formatHeading, formatNumber } from "@/lib/landing/format";
import { CRS, SITE_NAME, SURVEY_COUNT, SURVEY_DATE } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { CloudView } from "./scene/CloudView";
import { isCoarsePointer, prefersReducedMotion, watchVisibility } from "./scene/env";
import { loadCloud } from "./scene/jobs";

const START: Camera = { tx: -40, ty: -10, tz: 8, yaw: 0.5, pitch: 0.62, dist: 640, fov: 0.82 };
const SCALES = [10, 20, 25, 50, 100, 200, 250, 500, 1000];

const positionText = (cam: Camera) => {
  const [x, y] = eyeOf(cam);
  return formatEastNorth(x, y);
};
const altitudeText = (cam: Camera) => `ALT ${formatNumber(altitudeOf(cam))} m · HDG ${formatHeading(cam.yaw)} · ${SURVEY_DATE.toUpperCase()}`;

/** The hero's slow orbit over the sample site, with the instrument readouts that follow the camera. */
export function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef<HTMLDivElement>(null);
  const altitudeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const barLabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current, frame = canvas?.parentElement;
    if (!canvas || !frame) return;
    const view = new CloudView(canvas, { maxWidth: 1600 });
    Object.assign(view.camera, START);
    const motion = !prefersReducedMotion();
    let cloud: PointCloud | null = null, visible = false, dirty = true, alive = true;
    let elapsed = 0, sinceDraw = 1, sinceHud = 1, last = performance.now(), raf = 0;
    let pointerX = 0, pointerY = 0, easedX = 0, easedY = 0;

    loadCloud().then(
      (c) => {
        if (!alive) return;
        cloud = c;
        dirty = true;
      },
      () => {},
    );

    const updateHud = () => {
      const cam = view.camera;
      if (positionRef.current) positionRef.current.textContent = positionText(cam);
      if (altitudeRef.current) altitudeRef.current.textContent = altitudeText(cam);
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
      view.camera.dist = view.cssWidth < 700 ? 820 : START.dist;
      if (motion) {
        elapsed += dt;
        sinceDraw += dt;
        sinceHud += dt;
        easedX += (pointerX - easedX) * Math.min(1, dt * 3);
        easedY += (pointerY - easedY) * Math.min(1, dt * 3);
        view.camera.yaw = START.yaw + elapsed * 0.035 + easedX * 0.3;
        view.camera.pitch = START.pitch - easedY * 0.1;
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
  }, []);

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
          <div>SAMPLE SITE · {SITE_NAME.toUpperCase()}</div>
          <div className={styles.hudDim}>
            SURVEY {SURVEY_COUNT} · {CRS}
          </div>
        </div>
        <div className={styles.hudRead}>
          <div className={styles.scalebar}>
            <i ref={barRef} />
            <span ref={barLabelRef}>100 m</span>
          </div>
          <div ref={positionRef}>{positionText(START)}</div>
          <div ref={altitudeRef}>{altitudeText(START)}</div>
        </div>
      </div>
    </>
  );
}
