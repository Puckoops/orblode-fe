"use client";

import { useEffect, useRef } from "react";
import type { PointCloud } from "@/lib/landing/cloud";
import {
  ALTIMETER_TICKS,
  STAGES,
  TAB_ANCHORS,
  TAB_RANGES,
  altitudeAt,
  altitudeFraction,
  cameraAt,
  elevationMix,
  formatAltitude,
  nearStage,
  siteOpacity,
  stageAltitudes,
  stageAt,
} from "@/lib/landing/descent";
import { formatEastNorth, formatNumber } from "@/lib/landing/format";
import { clamp, lerp, smoothstep } from "@/lib/landing/math";
import { CRS, EXTENT, PILES, RIM, SURVEY_DATE, pileOutline, sample } from "@/lib/landing/terrain";
import styles from "./landing.module.css";
import { CloudView, type ScreenPoint } from "./scene/CloudView";
import { accent, ink } from "./scene/draw";
import { cssFont, isCoarsePointer, prefersReducedMotion, watchVisibility } from "./scene/env";
import { drawGlobe } from "./scene/globe";
import { loadCloud } from "./scene/jobs";

const ALTITUDES = stageAltitudes();

const PANELS = [
  { title: "Every site you run, on one globe.", text: "Each site keeps its full survey history, its team and who can see what. Open any of them in one click." },
  {
    title: "Each flight lands as a survey.",
    text: "Upload the orthomosaic, DSM, DTM and point cloud from whatever processed the flight. Orblode reads the coordinate system and lines every survey up on the same ground.",
  },
  {
    title: "Walk the twin in 3D.",
    text: "Point clouds stream as 3D tiles, so a 57M-point survey opens in a browser tab. Colour it by elevation or by the photos themselves.",
  },
  {
    title: "Draw a boundary. Get a volume with a receipt.",
    text: "Every number records its base, grid and survey, so anyone on the team can check how it was made.",
  },
];

const SURVEY_CORNERS: readonly (readonly [number, number])[] = [
  [-EXTENT, -EXTENT],
  [EXTENT, -EXTENT],
  [EXTENT, EXTENT],
  [-EXTENT, EXTENT],
];

function tracePath(ctx: CanvasRenderingContext2D, points: ScreenPoint[], close: boolean) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
}

/**
 * The pinned descent: scroll takes the camera from a globe of sites down through the survey and the
 * point cloud to a stockpile being measured. The altimeter reads the camera's own height.
 */
export function Descent({ volume, footprint }: { volume: number; footprint: number }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current, canvas = canvasRef.current;
    if (!section || !canvas) return;
    const find = <T extends HTMLElement>(name: string) => section.querySelector<T>(`[data-part="${name}"]`);
    const panels = Array.from(section.querySelectorAll<HTMLElement>("[data-stage]"));
    const tabs = Array.from(section.querySelectorAll<HTMLElement>("[data-tab]"));
    const marker = find("marker"), reading = find("reading"), legend = find("legend"), coords = find("coords");
    const surveyChip = find("survey-chip"), pileChip = find("pile-chip"), pileChipValue = find("pile-chip-value"), receiptVolume = find("receipt-volume");

    const view = new CloudView(canvas, { maxWidth: 1600 });
    const motion = !prefersReducedMotion();
    const outline = pileOutline();
    const pileTop = sample(PILES[0].x, PILES[0].y).z + 3;
    const landCount = isCoarsePointer() ? 4200 : 7000;
    let fonts = { sans: cssFont(section, "--font-sans", "sans-serif"), mono: cssFont(section, "--font-mono", "monospace") };
    let cloud: PointCloud | null = null, visible = false, dirty = true, alive = true;
    let s = 0, time = 0, sinceDraw = 1, last = performance.now(), raf = 0;
    const shown = new Map<HTMLElement, string>();
    const setText = (el: HTMLElement | null, text: string) => {
      if (!el || shown.get(el) === text) return;
      shown.set(el, text);
      el.textContent = text;
    };

    loadCloud().then(
      (c) => {
        if (!alive) return;
        cloud = c;
        dirty = true;
      },
      () => {},
    );
    document.fonts?.ready.then(() => {
      fonts = { sans: cssFont(section, "--font-sans", "sans-serif"), mono: cssFont(section, "--font-mono", "monospace") };
      dirty = true;
    });

    const placeChip = (el: HTMLElement | null, point: ScreenPoint | null, opacity: number, centred: boolean) => {
      if (!el) return;
      if (!point || opacity <= 0.01) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(${centred ? "-50%" : "0"}, calc(-100% - 10px))`;
    };

    const drawOverlays = (ctx: CanvasRenderingContext2D) => {
      const boundary = nearStage(s, 1) * smoothstep(0.8, 1, s);
      if (boundary > 0.01 && cloud) {
        const corners = SURVEY_CORNERS.map(([x, y]) => view.project(x, y, RIM));
        if (corners.every(Boolean)) {
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = ink(0.6 * boundary);
          ctx.lineWidth = 1;
          tracePath(ctx, corners as ScreenPoint[], true);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      const measured = smoothstep(2.45, 2.75, s);
      if (measured > 0.01 && cloud) {
        const points = outline.map(([x, y, z]) => view.project(x, y, z));
        if (!points.every(Boolean)) return;
        const ring = points as ScreenPoint[], total = ring.length, drawn = smoothstep(2.5, 2.88, s) * total, whole = Math.floor(drawn);
        ctx.beginPath();
        ctx.moveTo(ring[0].x, ring[0].y);
        for (let i = 1; i <= Math.min(whole, total); i++) ctx.lineTo(ring[i % total].x, ring[i % total].y);
        if (whole < total) {
          const a = ring[whole % total], b = ring[(whole + 1) % total], k = drawn - whole;
          ctx.lineTo(lerp(a.x, b.x, k), lerp(a.y, b.y, k));
        }
        ctx.strokeStyle = accent(measured);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        if (drawn >= total - 0.001) {
          tracePath(ctx, ring, true);
          ctx.fillStyle = accent(0.16 * measured);
          ctx.fill();
        }
        ctx.fillStyle = ink(measured);
        for (let i = 0; i < Math.min(whole + 1, total); i += 4) {
          ctx.beginPath();
          ctx.arc(ring[i].x, ring[i].y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const draw = (progress: number) => {
      cameraAt(s, time, motion, view.camera);
      if (view.cssWidth < 760) {
        // On a phone the copy covers the top of the window, so look further ahead to set the subject lower.
        const cam = view.camera, ahead = ((cam.dist * Math.tan(cam.fov / 2)) / Math.sin(cam.pitch)) * 0.35 * siteOpacity(s);
        cam.tx += Math.sin(cam.yaw) * ahead;
        cam.ty += Math.cos(cam.yaw) * ahead;
      }
      const mix = elevationMix(s);
      view.colourMix = mix;
      view.splat = lerp(1.25, 0.42, mix);
      view.fade = siteOpacity(s);
      view.render(cloud);
      drawGlobe(view.ctx, { width: view.width, height: view.height, dpr: view.dpr, landCount, ...fonts }, s, time, motion);
      view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      drawOverlays(view.ctx);
      view.ctx.setTransform(1, 0, 0, 1, 0, 0);

      panels.forEach((el, stage) => {
        el.style.opacity = nearStage(s, stage, 2.2).toFixed(3);
        el.style.transform = `translate3d(0, ${((stage - s) * 26).toFixed(1)}px, 0)`;
      });
      tabs.forEach((el, stage) => {
        const [a, b] = TAB_RANGES[stage];
        el.style.setProperty("--fill", clamp((progress - a) / (b - a), 0, 1).toFixed(3));
        if (progress >= a && (progress < b || stage === STAGES.length - 1)) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
      const altitude = altitudeAt(s, view.camera);
      if (marker) marker.style.top = `${(altitudeFraction(altitude) * 100).toFixed(2)}%`;
      setText(reading, `ALT ${formatAltitude(altitude)}`);
      if (legend) legend.style.opacity = mix.toFixed(3);
      setText(coords, s < 0.72 ? "LAT −32.400° · LON 151.250° · WGS 84" : `${formatEastNorth(view.camera.tx, view.camera.ty, 0)} · ${CRS}`);
      const survey = nearStage(s, 1) * smoothstep(0.85, 1, s);
      placeChip(surveyChip, cloud && survey > 0.01 ? view.project(-EXTENT, EXTENT, RIM) : null, survey, false);
      const counted = formatNumber(volume * smoothstep(2.7, 2.97, s));
      setText(pileChipValue, counted);
      setText(receiptVolume, `${counted} m³`);
      const pile = smoothstep(2.75, 2.95, s);
      placeChip(pileChip, cloud && pile > 0.01 && view.cssWidth >= 760 ? view.project(PILES[0].x, PILES[0].y, pileTop) : null, pile, true);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      time += dt;
      sinceDraw += dt;
      const total = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-section.getBoundingClientRect().top / total, 0, 1);
      const target = stageAt(progress), moving = Math.abs(target - s) > 0.0005;
      s = motion ? lerp(s, target, 1 - Math.exp(-dt * 6)) : target;
      if (moving || dirty || (motion && sinceDraw > 1 / 30)) {
        dirty = false;
        sinceDraw = 0;
        draw(progress);
      }
    };

    const stopWatching = watchVisibility(section, (v) => {
      visible = v;
      if (v) {
        view.resize();
        dirty = true;
      }
    });
    const resizer = new ResizeObserver(() => {
      view.resize();
      dirty = true;
    });
    resizer.observe(canvas);
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopWatching();
      resizer.disconnect();
    };
  }, [volume]);

  const jumpTo = (stage: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY, total = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + TAB_ANCHORS[stage] * total, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  return (
    <section ref={sectionRef} id="descent" aria-labelledby="descent-title" className={styles.descent}>
      <h2 id="descent-title" className={styles.srOnly}>
        From orbit down to a measured stockpile
      </h2>
      <div className={styles.descentPin}>
        <div className={`${styles.window} ${styles.descentWindow}`}>
          <canvas ref={canvasRef} aria-hidden="true" className={styles.layer} />
          <div aria-hidden="true" className={`${styles.layer} ${styles.descentScrim}`} />
          <div data-part="survey-chip" aria-hidden="true" className={styles.chip}>
            Survey {SURVEY_DATE} · ortho 2.1 cm · DSM 0.2 m
          </div>
          <div data-part="pile-chip" aria-hidden="true" className={`${styles.chip} ${styles.chipAccent}`}>
            Stockpile 1 · <span data-part="pile-chip-value">{formatNumber(volume)}</span> m³
          </div>
          <div className={styles.stageCopy}>
            {PANELS.map((panel, stage) => (
              <article key={panel.title} data-stage={stage} className={styles.stagePanel} style={{ opacity: stage === 0 ? 1 : 0 }}>
                <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>{STAGES[stage]}</span>
                <h3 className={styles.stageTitle}>{panel.title}</h3>
                <p>{panel.text}</p>
                {stage === 3 && (
                  <dl className={styles.miniReceipt}>
                    <div>
                      <dt>Volume</dt>
                      <dd data-part="receipt-volume">{formatNumber(volume)} m³</dd>
                    </div>
                    <div>
                      <dt>Footprint</dt>
                      <dd>{formatNumber(footprint)} m²</dd>
                    </div>
                    <div className={styles.receiptOptional}>
                      <dt>Base</dt>
                      <dd>Lowest perimeter point</dd>
                    </div>
                    <div className={styles.receiptOptional}>
                      <dt>Grid</dt>
                      <dd>0.2 m</dd>
                    </div>
                    <div>
                      <dt>Survey</dt>
                      <dd>{SURVEY_DATE}</dd>
                    </div>
                  </dl>
                )}
              </article>
            ))}
          </div>
          <div aria-hidden="true" className={styles.altimeter}>
            <div className={styles.altTrack} />
            {ALTIMETER_TICKS.map(([altitude, label]) => (
              <span key={label} className={styles.altTick} style={{ top: `${(altitudeFraction(altitude) * 100).toFixed(2)}%` }}>
                {label}
              </span>
            ))}
            <div data-part="marker" className={styles.altMarker}>
              <b data-part="reading">ALT {ALTITUDES[0]}</b>
            </div>
          </div>
          <div data-part="legend" aria-hidden="true" className={styles.elevLegend}>
            <span>Elevation, m AHD</span>
            <i />
          </div>
          <div data-part="coords" aria-hidden="true" className={`${styles.hud} ${styles.hudCoords}`}>
            LAT −32.400° · LON 151.250° · WGS 84
          </div>
          <div role="group" aria-label="Jump to a stage" className={styles.stageTabs}>
            {STAGES.map((name, stage) => (
              <button key={name} type="button" data-tab={stage} onClick={() => jumpTo(stage)} className={styles.stageTab}>
                <span className={styles.tabFill} />
                <span>{name}</span>
                <span className={styles.tabAlt}>{ALTITUDES[stage]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
