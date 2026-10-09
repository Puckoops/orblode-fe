"use client";

import { useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, type SpringOptions, type UseScrollOptions } from "framer-motion";
import { useEffect, useRef, type RefObject } from "react";

const IDLE_AFTER_MS = 2500;
const IDLE_STEP_MS = 3500;

type Options = {
  section: RefObject<HTMLElement | null>;
  /** The pinned panel; idling only runs while most of it is on screen. */
  pin: RefObject<HTMLElement | null>;
  offset: UseScrollOptions["offset"];
  /** Maps the section's scroll progress (0–1) to a step position. */
  toPosition: (progress: number) => number;
  /** The highest whole step scroll reaches. Idling steps 0…last and rewinds to 0, or with `loop` keeps counting up. */
  last: number;
  /** The picture repeats every `last + 1` steps from 0 up, so idling can deal on in one direction forever. */
  loop?: boolean;
  spring?: SpringOptions;
};

/**
 * A spring-smoothed step position for a pinned section: scroll drives it, and once scrolling has
 * stopped it steps on by itself until the next scroll takes over again.
 */
export function useScrollSteps({ section, pin, offset, toPosition, last, loop, spring }: Options) {
  const reduced = useReducedMotion();
  const inView = useInView(pin, { amount: 0.6 });
  const position = useMotionValue(toPosition(0));
  const smooth = useSpring(position, spring ?? { stiffness: 120, damping: 24, mass: 0.7 });
  const lastScroll = useRef(0);

  const { scrollYProgress } = useScroll({ target: section, offset });
  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    lastScroll.current = performance.now();
    const target = toPosition(progress);
    if (loop) {
      // After idling past the end, jump to the nearest identical lap so scroll eases a step or two, not back through every lap.
      const period = last + 1;
      const current = smooth.get();
      const laps = Math.round((current - Math.max(target, 0)) / period);
      if (laps > 0 && current - laps * period >= 0) smooth.jump(current - laps * period);
    }
    position.set(target);
  });

  useEffect(() => {
    if (!inView || reduced) return;
    const timer = setInterval(() => {
      if (performance.now() - lastScroll.current < IDLE_AFTER_MS) return;
      const next = Math.round(position.get()) + 1;
      position.set(next > last && !loop ? 0 : next);
    }, IDLE_STEP_MS);
    return () => clearInterval(timer);
  }, [inView, reduced, position, last, loop]);

  return { position: smooth, reduced: !!reduced };
}
