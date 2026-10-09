import { OrblodeMark } from "./OrblodeLogo";
import styles from "./loader.module.css";

type LoaderProps = {
  /** `screen` covers the viewport, `fill` covers its positioned parent, `page` takes a route's content area, `block` sits in a panel. */
  variant?: "screen" | "fill" | "page" | "block";
  label?: string;
  leaving?: boolean;
  className?: string;
};

/** The pulsing Orblode lockup shown wherever the platform waits on a page, scene or list. */
export function Loader({ variant = "block", label = "Loading", leaving, className }: LoaderProps) {
  return (
    <div role="status" aria-label={label} className={[styles.loader, styles[variant], leaving && styles.leaving, className].filter(Boolean).join(" ")}>
      <OrblodeMark size={28} className={styles.mark} />
      <span aria-hidden="true" className={styles.wordmark}>
        ORBLODE
      </span>
      <span aria-hidden="true" className={styles.rule} />
    </div>
  );
}
