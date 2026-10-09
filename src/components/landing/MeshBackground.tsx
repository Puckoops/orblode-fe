"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";
import { prefersReducedMotion } from "./reveal";

const BLOBS = [
  { x: 0.2, y: 0.3, r: 0.45, rgb: "74,70,40", op: 0.22, spd: 0.0003 },
  { x: 0.7, y: 0.7, r: 0.35, rgb: "196,104,56", op: 0.18, spd: 0.0004 },
  { x: 0.45, y: 0.5, r: 0.4, rgb: "58,56,32", op: 0.25, spd: 0.0002 },
  { x: 0.6, y: 0.25, r: 0.25, rgb: "212,168,80", op: 0.14, spd: 0.00035 },
  { x: 0.3, y: 0.75, r: 0.3, rgb: "139,68,32", op: 0.16, spd: 0.0003 },
];
const FRAME_MS = 1000 / 60;

/** Slow-drifting warm gradient blobs behind the whole page. */
export function MeshBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = prefersReducedMotion();
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      // Frames are counted at 60 Hz so a 120 Hz display drifts at the same pace.
      const t = (now - start) / FRAME_MS;
      const { width: w, height: h } = canvas;
      ctx.fillStyle = "#0a0908";
      ctx.fillRect(0, 0, w, h);
      for (const b of BLOBS) {
        const bx = (b.x + Math.sin(t * b.spd * 6.28) * 0.12) * w;
        const by = (b.y + Math.cos(t * b.spd * 4.71) * 0.1) * h;
        const br = b.r * Math.max(w, h);
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        grad.addColorStop(0, `rgba(${b.rgb},${b.op})`);
        grad.addColorStop(0.4, `rgba(${b.rgb},${b.op * 0.5})`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (still) draw(start);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className={styles.mesh} aria-hidden="true" />;
}
