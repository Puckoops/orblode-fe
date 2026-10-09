"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { useDemoRequest } from "./DemoRequest";
import styles from "./landing.module.css";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#industries", label: "Industries" },
  { href: "#viewer", label: "Viewer" },
  { href: "#how", label: "How it works" },
  { href: "#", label: "About" },
];

export function SiteHeader() {
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openDemo = useDemoRequest();

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setSolid(window.scrollY > 80);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <>
      {menuOpen && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className={styles.menu}>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close" className={`${styles.iconButton} ${styles.menuClose}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none" aria-hidden="true">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} onClick={close} className={styles.menuLink}>
              {l.label}
            </a>
          ))}
          <Link href="/sign-in" className={styles.menuLink}>
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => {
              close();
              openDemo();
            }}
            className={styles.pill}
            style={{ marginTop: 16, fontSize: 14 }}
          >
            Request a demo
          </button>
        </div>
      )}

      <nav className={solid ? `${styles.nav} ${styles.navSolid}` : styles.nav}>
        <a href="#" aria-label="Orblode, back to top" className={styles.brand}>
          <OrblodeLogo size={26} />
        </a>
        <div className={styles.navLinks}>
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className={styles.navLink}>
              {l.label}
            </a>
          ))}
        </div>
        <div className={styles.navActions}>
          <Link href="/sign-in" className={`${styles.navLink} ${styles.deskOnly}`}>
            Sign in
          </Link>
          <button type="button" onClick={openDemo} className={`${styles.navCta} ${styles.deskOnly}`}>
            Request a demo
          </button>
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen} className={`${styles.iconButton} ${styles.menuToggle}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none" aria-hidden="true">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          </button>
        </div>
      </nav>
    </>
  );
}
