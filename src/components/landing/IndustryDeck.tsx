"use client";

import { cubicBezier, motion, useTransform, type MotionValue } from "framer-motion";
import { useRef, type ReactNode } from "react";
import styles from "./landing.module.css";
import { StepProgress } from "./StepProgress";
import { useScrollSteps } from "./useScrollSteps";

const mono = "var(--font-mono)";
const CORRIDOR = "6,46 42,40 70,20 104,24 130,38 154,14";

const COOL = "rgba(122,142,168,";
const WARM = "rgba(216,128,80,";

const SLIDES = [
  {
    title: "Mining & Quarries",
    text: "Stockpile inventories, pit progress and haul-road grades from every flight. Reconcile the mine plan against what the ground actually shows.",
    meta: "Stockpiles · Pit progress · Reconciliation",
    art: (
      <svg viewBox="0 0 160 110" width="100%" height="140" aria-hidden="true">
        {[
          { rx: 54, ry: 34, dy: 0, a: 0.04, s: 0.22 },
          { rx: 40, ry: 24, dy: 2, a: 0.05, s: 0.3 },
          { rx: 26, ry: 15, dy: 4, a: 0.07, s: 0.38 },
          { rx: 12, ry: 6, dy: 6, a: 0.1, s: 0.5 },
        ].map((b) => (
          <ellipse key={b.rx} cx="60" cy={56 + b.dy} rx={b.rx} ry={b.ry} fill={`${COOL}${b.a})`} stroke={`${COOL}${b.s})`} strokeWidth="0.6" />
        ))}
        <path d="M112,96 Q124,72 136,70 Q146,72 156,96 Z" fill={`${WARM}0.08)`} stroke={`${WARM}0.45)`} strokeWidth="0.8" />
        <rect x="112" y="52" width="46" height="13" rx="3" fill="rgba(10,9,8,0.85)" stroke="rgba(242,230,214,0.08)" />
        <text x="135" y="61" textAnchor="middle" fill="#D88050" fontFamily={mono} fontSize="7">
          3,120 m³
        </text>
        <text x="60" y="104" textAnchor="middle" fill={`${COOL}0.6)`} fontFamily={mono} fontSize="6">
          PIT · 4 BENCHES
        </text>
      </svg>
    ),
  },
  {
    title: "Construction & Earthworks",
    text: "Compare as-built surfaces with the design, quantify cut and fill, and back every progress claim with survey evidence.",
    meta: "Design vs as-built · Cut/fill · Progress claims",
    art: (
      <svg viewBox="0 0 160 100" width="100%" height="130" aria-hidden="true">
        <path d="M8,54 L8,66 L25.5,54 Z M61.4,54 L70,58 L82,54 Z M115,54 L130,60 L139.4,54 Z" fill={`${WARM}0.16)`} />
        <path d="M25.5,54 L40,44 L61.4,54 Z M82,54 L100,48 L115,54 Z M139.4,54 L152,46 L152,54 Z" fill={`${COOL}0.2)`} />
        <polyline points="8,66 40,44 70,58 100,48 130,60 152,46" fill="none" stroke={`${COOL}0.7)`} strokeWidth="1" />
        <line x1="8" y1="54" x2="152" y2="54" stroke={`${WARM}0.7)`} strokeWidth="0.8" strokeDasharray="5 4" />
        <text x="42" y="38" textAnchor="middle" fill="#7A8EA8" fontFamily={mono} fontSize="6">
          CUT
        </text>
        <text x="70" y="70" textAnchor="middle" fill="#D88050" fontFamily={mono} fontSize="6">
          FILL
        </text>
        <line x1="34" y1="88" x2="46" y2="88" stroke={`${WARM}0.7)`} strokeWidth="0.8" strokeDasharray="3 2" />
        <text x="50" y="90" fill="#8A7E68" fontFamily={mono} fontSize="6">
          DESIGN
        </text>
        <line x1="88" y1="88" x2="100" y2="88" stroke={`${COOL}0.7)`} strokeWidth="1" />
        <text x="104" y="90" fill="#8A7E68" fontFamily={mono} fontSize="6">
          AS-BUILT
        </text>
      </svg>
    ),
  },
  {
    title: "Infrastructure & Utilities",
    text: "Roads, rail, pipelines, transmission lines and solar farms. Inspect long corridors in 3D, measure clearances and keep asset records on the map.",
    meta: "Corridors · Clearances · Asset records",
    art: (
      <>
        <svg viewBox="0 0 160 60" width="100%" height="56" aria-hidden="true">
          <polyline points={CORRIDOR} fill="none" stroke={`${COOL}0.12)`} strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={CORRIDOR} fill="none" stroke={`${COOL}0.6)`} strokeWidth="1" strokeLinejoin="round" />
          {CORRIDOR.split(" ").map((pt) => {
            const [cx, cy] = pt.split(",");
            return <circle key={pt} cx={cx} cy={cy} r="2" fill="#7A8EA8" />;
          })}
          <circle cx="104" cy="24" r="4" fill="none" stroke={`${WARM}0.7)`} strokeWidth="0.8" />
        </svg>
        <div className={styles.record} aria-hidden="true">
          <div className={styles.recordHead}>Asset Record</div>
          <div className={styles.recordRow}>
            <span>Chainage</span>
            <span>12+450</span>
          </div>
          <div className={styles.recordRow}>
            <span>Asset</span>
            <span>TX-2891</span>
          </div>
        </div>
      </>
    ),
  },
];

type Slide = (typeof SLIDES)[number];
type Pose = { x: number; y: number; rotateY: number; scale: number; opacity: number; z: number };

const ease = cubicBezier(0.25, 1, 0.5, 1);
const OFFSTAGE_X = 115;
const ARC_Y = 6;
const TURN = 28;
const FAR_SCALE = 0.82;

/**
 * A card's pose at `rel` steps from centre: from -1 to 0 it flies in from the right, decelerating
 * as it turns to face the viewer; from 0 to 1 it leaves to the left. The leaving and arriving cards
 * share one eased step, so they always stay a card and a bit apart and never overlap.
 */
function poseAt(rel: number, reduced: boolean): Pose {
  const t = Math.min(Math.abs(rel), 1);
  const away = rel < 0 ? 1 - ease(1 - t) : ease(t);
  const side = rel < 0 ? 1 : -1;
  const opacity = Math.max(0, 1 - away * 1.25);
  if (reduced) return { x: 0, y: 0, rotateY: 0, scale: 1, opacity, z: rel < 0 ? 30 : 10 };
  return {
    x: side * OFFSTAGE_X * away,
    y: ARC_Y * away,
    rotateY: -side * TURN * away,
    scale: 1 - (1 - FAR_SCALE) * away,
    opacity,
    z: rel === 0 ? 20 : rel < 0 ? 30 : 10,
  };
}

/** Steps from centre for card `index`; from step 0 up the deck repeats every `count` steps, so idling deals on forever. */
function relativeStep(position: number, index: number, count: number) {
  if (position < 0) return position - index;
  return ((((position - index + 1) % count) + count) % count) - 1;
}

/**
 * The industries as a deck. As the section scrolls in and stays pinned, each card flies in from the
 * right while the one before leaves to the left; when scrolling stops, the deck keeps dealing by itself.
 */
export function IndustryDeck({ head }: { head: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const { position, reduced } = useScrollSteps({
    section: sectionRef,
    pin: pinRef,
    offset: ["start end", "end end"],
    // The first card lands just as the section pins (progress ≈ 0.4), the last at 0.9, then a short hold.
    toPosition: (progress) => Math.min(Math.max(-1 + (SLIDES.length * (progress - 0.15)) / 0.75, -1), SLIDES.length - 1),
    last: SLIDES.length - 1,
    loop: true,
  });

  return (
    <section ref={sectionRef} id="industries" data-section="" className={styles.industrySection}>
      <div ref={pinRef} className={styles.scrollPin}>
        {head}
        <div className={styles.deck}>
          {SLIDES.map((slide, i) => (
            <DeckCard key={slide.title} slide={slide} index={i} position={position} reduced={reduced} />
          ))}
        </div>
        <StepProgress count={SLIDES.length} position={position} />
      </div>
    </section>
  );
}

function DeckCard({ slide, index, position, reduced }: { slide: Slide; index: number; position: MotionValue<number>; reduced: boolean }) {
  const pose = (p: number) => poseAt(relativeStep(p, index, SLIDES.length), reduced);
  const x = useTransform(position, (p) => `${pose(p).x}%`);
  const y = useTransform(position, (p) => `${pose(p).y}%`);
  const rotateY = useTransform(position, (p) => pose(p).rotateY);
  const scale = useTransform(position, (p) => pose(p).scale);
  const opacity = useTransform(position, (p) => pose(p).opacity);
  const zIndex = useTransform(position, (p) => pose(p).z);
  const visibility = useTransform(position, (p) => (pose(p).opacity < 0.02 ? "hidden" : "visible"));

  return (
    <motion.div style={{ x, y, rotateY, scale, opacity, zIndex, visibility }} className={`${styles.glass} ${styles.deckCard}`}>
      <div className={styles.industryArt}>{slide.art}</div>
      <h3 className={styles.industryTitle}>{slide.title}</h3>
      <p className={styles.industryText}>{slide.text}</p>
      <p className={styles.industryMeta}>{slide.meta}</p>
    </motion.div>
  );
}
