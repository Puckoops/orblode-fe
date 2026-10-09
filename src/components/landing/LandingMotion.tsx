"use client";

import { useEffect } from "react";

/**
 * Drives the page's scroll choreography over server-rendered markup: reveals `[data-rv]`
 * elements as they enter, dims `[data-section]`s scrolled past, draws the workflow line,
 * and tilts `[data-glass-card]`s under the cursor.
 */
export function LandingMotion() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    const reveals = Array.from(document.querySelectorAll<HTMLElement>("[data-rv]"));
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-in", "");
          revealObserver.unobserve(e.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -20px 0px" },
    );
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        for (const el of reveals) {
          if (el.getBoundingClientRect().top < window.innerHeight + 50) el.setAttribute("data-in", "");
          else revealObserver.observe(el);
        }
      });
    });
    cleanups.push(() => {
      cancelAnimationFrame(frame);
      revealObserver.disconnect();
    });

    const exitObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          e.target.toggleAttribute("data-exited", !e.isIntersecting && e.boundingClientRect.top < 0);
        }
      },
      { threshold: 0.05 },
    );
    document.querySelectorAll("[data-section]").forEach((s) => exitObserver.observe(s));
    cleanups.push(() => exitObserver.disconnect());

    const line = document.querySelector<HTMLElement>("[data-workflow-line]");
    const lineSection = line?.closest("[data-section]");
    if (line && lineSection) {
      const lineObserver = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return;
          line.setAttribute("data-in", "");
          lineObserver.disconnect();
        },
        { threshold: 0.3 },
      );
      lineObserver.observe(lineSection);
      cleanups.push(() => lineObserver.disconnect());
    }

    document.querySelectorAll<HTMLElement>("[data-glass-card]").forEach((card) => {
      const onMove = (e: MouseEvent) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${x * 2}deg) rotateX(${-y * 2}deg) translateY(-3px) scale(1.02)`;
        card.style.borderColor = "rgba(242,230,214,0.18)";
      };
      const onLeave = () => {
        card.style.transform = "";
        card.style.borderColor = "";
        card.style.transition = "transform 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s ease";
      };
      card.addEventListener("mousemove", onMove);
      card.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        card.removeEventListener("mousemove", onMove);
        card.removeEventListener("mouseleave", onLeave);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
