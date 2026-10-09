"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";
import { prefersReducedMotion } from "./reveal";

type Spot = { top: number; left?: number; right?: number; size: number; faint?: boolean };

const SPOTS: Spot[] = [
  { top: 12, left: 8, size: 8 },
  { top: 35, right: 7, size: 12, faint: true },
  { top: 58, left: 20, size: 6 },
  { top: 75, right: 18, size: 10, faint: true },
  { top: 22, left: 62, size: 7 },
  { top: 48, right: 32, size: 14, faint: true },
  { top: 82, left: 42, size: 5 },
  { top: 14, right: 45, size: 9, faint: true },
];
const FRAME_MS = 1000 / 60;
const REACH = 200;
const PUSH = 20;

/** Glass specks that drift in place and lean away from the cursor. */
export function Particles() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const motion = SPOTS.map(() => ({
      ox: 0,
      oy: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0002 + Math.random() * 0.0003,
      radius: 15 + Math.random() * 20,
    }));
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    const onMouse = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
    };
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const t = (now - start) / FRAME_MS;
      const w = window.innerWidth;
      const h = window.innerHeight;
      SPOTS.forEach((spot, i) => {
        const el = refs.current[i];
        const m = motion[i];
        if (!el) return;
        const dx = Math.sin(t * m.speed + m.phase) * m.radius;
        const dy = Math.cos(t * m.speed * 0.7 + m.phase) * m.radius;
        // Rest centre from the spot's own percentages, so no layout read per frame.
        const restX = spot.left !== undefined ? (spot.left / 100) * w + spot.size / 2 : w - (spot.right! / 100) * w - spot.size / 2;
        const restY = (spot.top / 100) * h + spot.size / 2;
        const distX = restX + dx + m.ox - mx;
        const distY = restY + dy + m.oy - my;
        const dist = Math.hypot(distX, distY);
        let ax = 0;
        let ay = 0;
        if (dist < REACH && dist > 0) {
          const force = (1 - dist / REACH) * PUSH;
          ax = (distX / dist) * force;
          ay = (distY / dist) * force;
        }
        m.ox += (ax - m.ox) * 0.05;
        m.oy += (ay - m.oy) * 0.05;
        el.style.transform = `translate(${dx + m.ox}px, ${dy + m.oy}px)`;
      });
      raf = requestAnimationFrame(tick);
    };

    document.addEventListener("mousemove", onMouse);
    raf = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("mousemove", onMouse);
      cancelAnimationFrame(raf);
    };
  }, []);

  return SPOTS.map((spot, i) => (
    <div
      key={i}
      ref={(el) => {
        refs.current[i] = el;
      }}
      aria-hidden="true"
      className={styles.particle}
      style={{
        top: `${spot.top}%`,
        left: spot.left !== undefined ? `${spot.left}%` : undefined,
        right: spot.right !== undefined ? `${spot.right}%` : undefined,
        width: spot.size,
        height: spot.size,
        opacity: spot.faint ? 0.85 : undefined,
      }}
    />
  ));
}
