"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import styles from "./landing.module.css";

/** One thin bar per step, filled while the position is on that step. Display only. */
export function StepProgress({ count, position }: { count: number; position: MotionValue<number> }) {
  return (
    <div aria-hidden="true" className={styles.progress}>
      {Array.from({ length: count }, (_, i) => (
        <Bar key={i} index={i} position={position} />
      ))}
    </div>
  );
}

function Bar({ index, position }: { index: number; position: MotionValue<number> }) {
  const scaleX = useTransform(position, (p) => 1 - Math.min(Math.abs(index - p), 1));
  return (
    <span className={styles.progressBar}>
      <motion.span style={{ scaleX }} className={styles.progressFill} />
    </span>
  );
}
