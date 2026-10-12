"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { useDemoRequest } from "./DemoRequest";
import styles from "./landing.module.css";

const LINKS = [
  { href: "#descent", label: "Platform" },
  { href: "#measure", label: "Measure" },
  { href: "#industries", label: "Industries" },
  { href: "#try", label: "Try it" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openDemo = useDemoRequest();

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 36));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
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
            <a key={l.href} href={l.href} onClick={close} className={styles.menuLink}>
              {l.label}
            </a>
          ))}
          <Link href="/sign-in" className={styles.menuLink}>
            Sign in
          </Link>
        </div>
      )}

      <header className={scrolled ? `${styles.nav} ${styles.navScrolled}` : styles.nav}>
        <a href="#main" aria-label="Orblode, back to top" className={styles.brand}>
          <OrblodeLogo size={18} />
        </a>
        <nav aria-label="Sections" className={styles.navLinks}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={styles.navLink}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={styles.navActions}>
          <Link href="/sign-in" className={`${styles.navLink} ${styles.signIn}`}>
            Sign in
          </Link>
          <button type="button" onClick={() => openDemo()} className={`${styles.btn} ${styles.btnSolid}`}>
            Request a demo
          </button>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Menu" aria-expanded={menuOpen} className={`${styles.iconButton} ${styles.menuToggle}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none" aria-hidden="true">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          </button>
        </div>
      </header>
    </>
  );
}
