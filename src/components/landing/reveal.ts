import type { CSSProperties } from "react";

export type RevealKind = "up" | "scale" | "tilt" | "clip";

/** Marks an element for LandingMotion to reveal when it scrolls into view, after `delay` seconds. */
export function rv(kind: RevealKind, delay = 0, style?: CSSProperties) {
  return { "data-rv": kind, style: delay ? ({ ...style, "--d": `${delay}s` } as CSSProperties) : style };
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
