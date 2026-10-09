import Link from "next/link";
import type { ReactNode } from "react";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import styles from "./auth.module.css";

export function AuthFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={styles.page}>
      <div className={styles.wash} />
      <Link href="/sign-in" className={styles.brand}>
        <OrblodeLogo size={32} />
      </Link>
      <main className={wide ? `${styles.card} ${styles.wide}` : styles.card}>{children}</main>
      <p className={`caption ${styles.foot}`}>A Puckoops product.</p>
    </div>
  );
}
