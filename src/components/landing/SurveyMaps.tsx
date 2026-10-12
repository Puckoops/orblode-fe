"use client";

import { useState, type CSSProperties } from "react";
import type { Picture } from "@/lib/landing/media";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";

/** Earlier against latest orthophoto, or elevation against photo when the site has one survey. */
export function SurveySwipe({ before, after, beforePicture, afterPicture }: { before: string; after: string; beforePicture: Picture; afterPicture: Picture }) {
  const [split, setSplit] = useState(50);
  return (
    <div className={styles.compare} style={{ "--split": `${split}%`, aspectRatio: `${afterPicture.width} / ${afterPicture.height}` } as CSSProperties}>
      <LandingPicture picture={beforePicture} alt="" sizes="(max-width: 760px) 100vw, 40vw" />
      <LandingPicture picture={afterPicture} alt="" sizes="(max-width: 760px) 100vw, 40vw" className={styles.compareAfter} />
      <span className={`${styles.compareLabel} ${styles.compareLabelLeft}`}>{before.toUpperCase()}</span>
      <span className={`${styles.compareLabel} ${styles.compareLabelRight}`}>{after.toUpperCase()}</span>
      <span aria-hidden="true" className={styles.compareHandle} />
      <label htmlFor="compare-split" className={styles.srOnly}>
        Divider between {before} and {after}
      </label>
      <input id="compare-split" type="range" min={0} max={100} step={1} value={split} onChange={(e) => setSplit(Number(e.target.value))} />
    </div>
  );
}
