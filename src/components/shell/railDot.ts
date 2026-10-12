import styles from "./shell.module.css";

/** The class that marks a rail item with a dot where Camelot hides its count badge, or none. */
export function railDotClass(show: boolean, collapsed: boolean): string | undefined {
  if (!show) return undefined;
  return collapsed ? styles.railDot : styles.wideDot;
}
