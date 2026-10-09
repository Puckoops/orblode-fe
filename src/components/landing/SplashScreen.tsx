"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import styles from "./landing.module.css";

const HOLD_MS = 2500;
const FADE_MS = 700;

/** The opening loader: holds for 2.5s, or until the visitor scrolls, then fades out. */
export function SplashScreen() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    if (phase !== "shown") return;
    const leave = () => setPhase("leaving");
    const onScroll = () => {
      if (window.scrollY > 30) leave();
    };
    const timer = setTimeout(leave, HOLD_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("gone"), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;
  return <Loader variant="screen" leaving={phase === "leaving"} className={styles.splash} />;
}
