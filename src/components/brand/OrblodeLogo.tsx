import type { CSSProperties } from "react";
import styles from "./logo.module.css";

/** The Orblode mark: a ring on a line that ends in a dot. `size` is the ring's height; the mark is half as wide again. */
export function OrblodeMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size * 1.5} height={size} viewBox="10 22 84 56" fill="none" aria-hidden="true" className={className}>
      <circle cx="38" cy="50" r="26" stroke="currentColor" strokeWidth="3.5" />
      <line x1="12" y1="50" x2="88" y2="50" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="88" cy="50" r="5" fill="currentColor" />
    </svg>
  );
}

/** The mark beside the ORBLODE wordmark, in the lockup's proportions. `size` is the mark's height. */
export function OrblodeLogo({ size = 28, className, wordmarkClassName }: { size?: number; className?: string; wordmarkClassName?: string }) {
  return (
    <span role="img" aria-label="Orblode" className={[styles.logo, className].filter(Boolean).join(" ")} style={{ "--logo-size": `${size}px` } as CSSProperties}>
      <OrblodeMark size={size} />
      <span aria-hidden="true" className={[styles.wordmark, wordmarkClassName].filter(Boolean).join(" ")}>
        ORBLODE
      </span>
    </span>
  );
}
