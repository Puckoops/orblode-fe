"use client";

import { Fragment, useEffect, useState, type CSSProperties } from "react";
import styles from "./landing.module.css";
import { prefersReducedMotion, type rv } from "./reveal";

export type TypeSegment = { text: string; className?: string } | "br";

const START_MS = 2800;
const CHUNK = 3;
const STAGGER_MS = 20;

/**
 * Renders the heading in three-character chunks so it can be retyped once the splash clears.
 * The server output is the finished heading; the chunks only blank and fade in on the client.
 */
export function Typewriter({ segments, label, className, reveal }: { segments: TypeSegment[]; label: string; className?: string; reveal?: ReturnType<typeof rv> }) {
  const [phase, setPhase] = useState<"still" | "hidden" | "running">("still");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setTimeout(() => setPhase("hidden"), START_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "hidden") return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("running"));
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  let index = 0;
  const chunks = (text: string) => {
    const out = [];
    for (let i = 0; i < text.length; i += CHUNK) {
      out.push(
        <span key={i} className={styles.typeChunk} style={{ "--t": `${index * STAGGER_MS}ms` } as CSSProperties}>
          {text.slice(i, i + CHUNK)}
        </span>,
      );
      index++;
    }
    return out;
  };

  const phaseClass = phase === "hidden" ? styles.typeHidden : phase === "running" ? styles.typeRunning : undefined;

  return (
    <h1 aria-label={label} {...reveal} className={[className, phaseClass].filter(Boolean).join(" ")}>
      {segments.map((seg, i) =>
        seg === "br" ? (
          <br key={i} />
        ) : seg.className ? (
          <span key={i} className={seg.className}>
            {chunks(seg.text)}
          </span>
        ) : (
          <Fragment key={i}>{chunks(seg.text)}</Fragment>
        ),
      )}
    </h1>
  );
}
