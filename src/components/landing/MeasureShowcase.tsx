"use client";

import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./landing.module.css";
import { rv } from "./reveal";
import { StepProgress } from "./StepProgress";
import { useScrollSteps } from "./useScrollSteps";

const GAP = 24;

const CARDS = [
  {
    title: "Precision Measurement",
    text: "Points, distances, areas, elevations and slopes, taken straight off the 3D model. Every measurement keeps a receipt of how it was made.",
    meta: "Distance · Area · Elevation · Slope",
    art: (
      <svg viewBox="0 0 200 80" width="100%" height="80" aria-hidden="true">
        <g stroke="rgba(196,104,56,0.2)" fill="none" strokeWidth="0.6">
          <path d="M10,65 Q50,55 100,45 Q150,35 200,25" />
          <path d="M10,72 Q50,62 100,52 Q150,42 200,32" />
        </g>
        <circle cx="50" cy="58" r="3" fill="#C46838" />
        <circle cx="170" cy="28" r="3" fill="#C46838" />
        <line x1="50" y1="58" x2="170" y2="28" stroke="rgba(196,104,56,0.5)" strokeWidth="0.8" strokeDasharray="4 3" />
        <rect x="88" y="30" width="42" height="16" rx="4" fill="rgba(10,9,8,0.85)" stroke="rgba(242,230,214,0.08)" />
        <text x="109" y="41" textAnchor="middle" fill="#D88050" fontFamily="var(--font-mono)" fontSize="8">
          186.4m
        </text>
      </svg>
    ),
  },
  {
    title: "Volumes & Earthworks",
    text: "Draw a boundary, get the volume. Cut, fill and net against a base surface or a fixed level, for stockpiles, pits and earthworks.",
    meta: "Cut/Fill · Net volume · Base surface",
    art: (
      <svg viewBox="0 0 200 80" width="100%" height="80" aria-hidden="true">
        <path
          d="M10,68 Q40,62 70,50 Q95,40 110,30 Q125,24 135,30 Q155,40 175,50 Q190,58 200,68"
          fill="rgba(196,104,56,0.06)"
          stroke="rgba(196,104,56,0.3)"
          strokeWidth="1"
        />
        <line x1="10" y1="68" x2="200" y2="68" stroke="rgba(242,230,214,0.06)" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="110" y1="30" x2="110" y2="68" stroke="rgba(196,104,56,0.3)" strokeWidth="0.5" strokeDasharray="3 3" />
        <rect x="80" y="10" width="58" height="16" rx="4" fill="rgba(10,9,8,0.85)" stroke="rgba(242,230,214,0.08)" />
        <text x="109" y="21" textAnchor="middle" fill="#D88050" fontFamily="var(--font-mono)" fontSize="8">
          42,800 m³
        </text>
      </svg>
    ),
  },
  {
    title: "Change Over Time",
    text: "Swipe between any two surveys of the same site. See what moved, what was built and what was removed between flights.",
    meta: "Survey compare · Progress · Change",
    art: (
      <svg viewBox="0 0 200 80" width="100%" height="80" aria-hidden="true">
        <rect x="20" y="8" width="160" height="64" rx="4" fill="rgba(242,230,214,0.015)" stroke="rgba(242,230,214,0.08)" />
        <path d="M20,58 Q60,50 100,54" fill="none" stroke="rgba(242,230,214,0.25)" strokeWidth="0.8" />
        <path d="M100,54 Q128,30 150,40 Q166,48 180,52" fill="rgba(196,104,56,0.08)" stroke="rgba(196,104,56,0.5)" strokeWidth="0.8" />
        <line x1="100" y1="8" x2="100" y2="72" stroke="rgba(242,230,214,0.3)" strokeWidth="0.8" />
        <circle cx="100" cy="40" r="5" fill="rgba(10,9,8,0.85)" stroke="rgba(242,230,214,0.3)" />
        <text x="28" y="20" fill="#8A7E68" fontFamily="var(--font-mono)" fontSize="7">
          MAR 12
        </text>
        <text x="172" y="20" textAnchor="end" fill="#D88050" fontFamily="var(--font-mono)" fontSize="7">
          JUN 04
        </text>
      </svg>
    ),
  },
];

type Card = (typeof CARDS)[number];

/**
 * The measurement features as three floating cards in a row. While the section is pinned, scroll
 * progress moves the spotlight across them; once scrolling stops, it moves on by itself. Where the
 * row is wider than the stage, the row slides to keep the spotlit card centred.
 */
export function MeasureShowcase({ head }: { head: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { position: spotlight, reduced } = useScrollSteps({
    section: sectionRef,
    pin: pinRef,
    offset: ["start start", "end end"],
    toPosition: (progress) => progress * (CARDS.length - 1),
    last: CARDS.length - 1,
  });
  const centre = useMotionValue(0);
  const step = useMotionValue(0);
  const x = useTransform([spotlight, centre, step], ([p, c, s]: number[]) => c - p * s);

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track) return;
    const measure = () => {
      const cardWidth = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      const fits = track.scrollWidth <= stage.clientWidth;
      // A row that fits is centred by CSS and stays put; one that doesn't is moved so the spotlit card sits mid-stage.
      centre.set(fits ? 0 : (stage.clientWidth - cardWidth) / 2);
      step.set(fits ? 0 : cardWidth + GAP);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [centre, step]);

  return (
    <section ref={sectionRef} id="measure" data-section="" className={styles.measureSection}>
      <div ref={pinRef} className={styles.scrollPin}>
        {head}
        <div ref={stageRef} {...rv("scale")} className={styles.showcase}>
          <motion.div ref={trackRef} style={{ x }} className={styles.showcaseTrack}>
            {CARDS.map((card, i) => (
              <ShowcaseCard key={card.title} card={card} index={i} spotlight={spotlight} still={reduced} />
            ))}
          </motion.div>
          <StepProgress count={CARDS.length} position={spotlight} />
        </div>
      </div>
    </section>
  );
}

function useDistance(spotlight: MotionValue<number>, index: number) {
  return useTransform(spotlight, (p) => Math.min(Math.abs(index - p), 1));
}

function ShowcaseCard({ card, index, spotlight, still }: { card: Card; index: number; spotlight: MotionValue<number>; still: boolean }) {
  const distance = useDistance(spotlight, index);
  const scale = useTransform(distance, [0, 1], [1.04, 0.94]);
  const opacity = useTransform(distance, [0, 1], [1, 0.5]);
  const lift = useTransform(distance, [0, 1], [-14, 8]);
  const borderColor = useTransform(distance, [0, 1], ["rgba(242, 230, 214, 0.2)", "rgba(242, 230, 214, 0.08)"]);

  return (
    <motion.div
      animate={still ? undefined : { y: [0, -8, 0] }}
      transition={{ duration: 5 + index * 0.9, delay: index * 0.7, repeat: Infinity, ease: "easeInOut" }}
      className={styles.cardFloat}
    >
      <motion.div style={{ scale, opacity, y: lift, borderColor }} className={`${styles.glass} ${styles.measureCard}`}>
        <div className={styles.measureArt}>{card.art}</div>
        <h3 className={styles.cardTitle}>{card.title}</h3>
        <p className={styles.cardText}>{card.text}</p>
        <p className={styles.cardMeta}>{card.meta}</p>
      </motion.div>
    </motion.div>
  );
}
