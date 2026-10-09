"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./landing.module.css";
import { prefersReducedMotion, rv } from "./reveal";

const COUNT_MS = 1800;

/** Four headline figures that count up, ease-out-expo, the first time the band is in view. */
export function Metrics() {
  const ref = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        if (prefersReducedMotion()) {
          setProgress(1);
          return;
        }
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / COUNT_MS, 1);
          setProgress(t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );
    observer.observe(section);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const figures = [
    { value: `< ${Math.round(progress * 2)}`, label: "cm accuracy" },
    { value: `${Math.round(progress * 23)}`, label: "min processing" },
    { value: `${Math.round(progress * 6)}`, label: "data types, one scene" },
    { value: "0", label: "install required" },
  ];

  return (
    <section ref={ref} data-section="" className={`${styles.section} ${styles.metricsSection}`}>
      <div {...rv("scale")} className={`${styles.glass} ${styles.metricsCard}`}>
        <div className={styles.metrics}>
          {figures.map((f) => (
            <div key={f.label} className={styles.metric}>
              <div className={styles.metricValue}>{f.value}</div>
              <div className={styles.metricLabel}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
