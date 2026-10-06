import { BrandMark } from "@puckoops/camelot";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={styles.page}>
      <div className={styles.wash} />
      <Link href="/sign-in" className={`small ${styles.brand}`}>
        <BrandMark size={22} />
        <span>ORBLODE</span>
      </Link>
      <main className={wide ? `${styles.card} ${styles.wide}` : styles.card}>{children}</main>
      <p className={`caption ${styles.foot}`}>A Puckoops product.</p>
    </div>
  );
}
