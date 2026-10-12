"use client";

import { useEffect, useRef } from "react";
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
  lookAheadOnNarrow,
  nearStage,
  posesFor,
  stageAt,
  type Camera,
} from "@/lib/landing/descent";
import { formatEastNorth, formatNumber } from "@/lib/landing/format";
import { clamp, lerp, smoothstep } from "@/lib/landing/math";
import { coverPoint, coverRect, frameForStage, sampleTrack, timeForFrame, type LandingMedia } from "@/lib/landing/media";
import type { SceneFrame, SiteInfo } from "@/lib/landing/site";
import { prefersReducedMotion, saveData, watchVisibility } from "./env";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";
import { useSite } from "./SiteContext";

const NARROW = "(max-width: 760px)";

function panelsFor(site: SiteInfo) {
  const measure = site.featured
    ? {
        title: "Draw a boundary. Get a volume with a receipt.",
        text: "Every number records its base and survey, so anyone on the team can check how it was made.",
      }
    : { title: "Measure anything on the twin.", text: "Volumes, cut and fill, distances and sections, each with a receipt of how it was made." };
  return [
    { title: "Every site you run, on one globe.", text: "Each site keeps its full survey history, its team and who can see what. Open any of them in one click." },
    {
      title: "Each flight lands as a survey.",
      text: "Upload the orthomosaic, DSM, DTM and point cloud from whatever processed the flight. Orblode reads the coordinate system and lines every survey up on the same ground.",
    },
    {
      title: "Walk the twin in 3D.",
      text: "Surfaces and point clouds stream into a browser tab. Colour the ground by elevation or by the photos themselves.",
    },
    measure,
  ];
}

const degrees = (v: number, positive: string, negative: string) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? positive : negative}`;

/**
 * The pinned descent: scroll takes the camera from a globe down through the survey and its
 * elevation to the featured measurement, as a pre-rendered video whose frame follows the scroll.
 * The altimeter reads the camera's own height.
 */
export function Descent({ descent, frame }: { descent: LandingMedia["descent"]; frame: SceneFrame }) {
  const site = useSite();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const section = sectionRef.current, video = videoRef.current, win = video?.parentElement;
    if (!section || !video || !win) return;
    const find = <T extends HTMLElement>(name: string) => section.querySelector<T>(`[data-part="${name}"]`);
    const panels = Array.from(section.querySelectorAll<HTMLElement>("[data-stage]"));
    const tabs = Array.from(section.querySelectorAll<HTMLElement>("[data-tab]"));
    const stills = Array.from(section.querySelectorAll<HTMLElement>("[data-stage-still]"));
    const marker = find("marker"), reading = find("reading"), legend = find("legend"), coords = find("coords");
    const surveyChip = find("survey-chip"), pileChip = find("pile-chip"), pileChipValue = find("pile-chip-value"), receiptVolume = find("receipt-volume");

    const narrow = window.matchMedia(NARROW).matches;
    const rendition = narrow ? descent.tall : descent.wide;
    const motion = !prefersReducedMotion();
    const poses = posesFor(frame), cam: Camera = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.6, dist: 600, fov: 0.82 };
    const latLon = `LAT ${degrees(site.lat, "N", "S")} · LON ${degrees(site.lon, "E", "W")} · WGS 84`;
    let useVideo = motion && !saveData(), ready = false, loading = false, blobUrl = "";
    let visible = false, dirty = true, alive = true;
    let s = 0, requested = -1, shown = 0, last = performance.now(), raf = 0;
    const text = new Map<HTMLElement, string>();
    const setText = (el: HTMLElement | null, value: string) => {
      if (!el || text.get(el) === value) return;
      text.set(el, value);
      el.textContent = value;
    };

    // The whole file up front: seeks then decode locally instead of waiting on range requests.
    const load = async () => {
      if (loading || !useVideo) return;
      loading = true;
      try {
        const res = await fetch(rendition.video.mp4);
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        if (!alive) return;
        blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        // iOS only paints seeked frames once the video has played.
        await video.play();
        video.pause();
        ready = true;
      } catch {
        useVideo = false;
      }
      dirty = true;
    };
    const onSeeked = () => {
      shown = requested;
      video.dataset.ready = "";
      dirty = true;
    };
    video.addEventListener("seeked", onSeeked);

    const placeChip = (el: HTMLElement | null, point: [number, number] | null, opacity: number, centred: boolean) => {
      if (!el) return;
      if (!point || opacity <= 0.01) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = `translate3d(${point[0].toFixed(1)}px, ${point[1].toFixed(1)}px, 0) translate(${centred ? "-50%" : "0"}, calc(-100% - 10px))`;
    };

    const draw = (progress: number) => {
      const target = frameForStage(s, rendition.framesPerStage);
      if (useVideo && ready) {
        if (target !== requested && !video.seeking) {
          requested = target;
          video.currentTime = timeForFrame(target, rendition.video.fps);
        }
      } else {
        shown = target;
        stills.forEach((el, stage) => (el.style.opacity = clamp(1 - Math.abs(s - stage), 0, 1).toFixed(3)));
      }

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
      cameraAt(s, 0, false, poses, cam);
      if (narrow) lookAheadOnNarrow(cam, s);
      const altitude = altitudeAt(s, cam, poses, frame.ground);
      if (marker) marker.style.top = `${(altitudeFraction(altitude) * 100).toFixed(2)}%`;
      setText(reading, `ALT ${formatAltitude(altitude)}`);
      if (legend) legend.style.opacity = elevationMix(s).toFixed(3);
      setText(coords, s < 0.72 ? latLon : `${formatEastNorth(cam.tx, cam.ty, site.origin, 0)} · ${site.crs}`);

      const rect = coverRect({ width: win.clientWidth, height: win.clientHeight }, rendition.video);
      const at = (track: typeof rendition.tracks.survey) => {
        const p = sampleTrack(track, shown);
        return p ? coverPoint(rect, p) : null;
      };
      placeChip(surveyChip, at(rendition.tracks.survey), nearStage(s, 1) * smoothstep(0.85, 1, s), false);
      if (site.featured?.volume) {
        const counted = formatNumber(site.featured.volume * smoothstep(2.7, 2.97, s));
        setText(pileChipValue, counted);
        setText(receiptVolume, `${counted} m³`);
        placeChip(pileChip, at(rendition.tracks.pile), smoothstep(2.75, 2.95, s), true);
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible) return;
      const total = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-section.getBoundingClientRect().top / total, 0, 1);
      const target = stageAt(progress), moving = Math.abs(target - s) > 0.0005;
      s = motion ? lerp(s, target, 1 - Math.exp(-dt * 6)) : target;
      if (!moving && !dirty) return;
      dirty = false;
      draw(progress);
    };

    const stopWatching = watchVisibility(section, (v) => {
      visible = v;
      dirty = true;
    });
    // A quarter screen ahead: the stills cover the wait, and the hero's video gets the bandwidth first.
    const stopLoading = watchVisibility(section, (near) => near && void load(), "25% 0px");
    const resizer = new ResizeObserver(() => (dirty = true));
    resizer.observe(win);
    raf = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopWatching();
      stopLoading();
      resizer.disconnect();
      video.removeEventListener("seeked", onSeeked);
      video.removeAttribute("src");
      video.load();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [site, descent, frame]);

  const jumpTo = (stage: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY, total = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + TAB_ANCHORS[stage] * total, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const altitudes = descent.stageAltitudes;
  const featured = site.featured;
  const panels = panelsFor(site);
  return (
    <section ref={sectionRef} id="descent" aria-labelledby="descent-title" className={styles.descent}>
      <h2 id="descent-title" className={styles.srOnly}>
        From orbit down to {featured ? `a measured ${featured.name}` : site.name}
      </h2>
      <div className={styles.descentPin}>
        <div className={`${styles.window} ${styles.descentWindow}`}>
          {descent.wide.stills.map((still, stage) => (
            <LandingPicture
              key={still.base}
              picture={still}
              narrow={descent.tall.stills[stage]}
              alt=""
              className={`${styles.layer} ${styles.mediaCover}`}
              style={{ opacity: stage === 0 ? 1 : 0 }}
              data-stage-still={stage}
            />
          ))}
          <video ref={videoRef} muted playsInline preload="none" aria-hidden="true" className={`${styles.layer} ${styles.mediaCover} ${styles.sceneCanvas}`} />
          <div aria-hidden="true" className={`${styles.layer} ${styles.descentScrim}`} />
          <div data-part="survey-chip" aria-hidden="true" className={styles.chip}>
            Survey {site.surveyDate} · {site.crs}
          </div>
          {featured?.volume ? (
            <div data-part="pile-chip" aria-hidden="true" className={`${styles.chip} ${styles.chipAccent}`}>
              {featured.name} · <span data-part="pile-chip-value">{formatNumber(featured.volume)}</span> m³
            </div>
          ) : null}
          <div className={styles.stageCopy}>
            {panels.map((panel, stage) => (
              <article key={panel.title} data-stage={stage} className={styles.stagePanel} style={{ opacity: stage === 0 ? 1 : 0 }}>
                <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>{STAGES[stage]}</span>
                <h3 className={styles.stageTitle}>{panel.title}</h3>
                <p>{panel.text}</p>
                {stage === 3 && featured && (
                  <dl className={styles.miniReceipt}>
                    <div>
                      <dt>{featured.name}</dt>
                      <dd data-part="receipt-volume">{featured.volume ? `${formatNumber(featured.volume)} m³` : "–"}</dd>
                    </div>
                    {featured.area !== null && (
                      <div>
                        <dt>Footprint</dt>
                        <dd>{formatNumber(featured.area)} m²</dd>
                      </div>
                    )}
                    {featured.base && (
                      <div className={styles.receiptOptional}>
                        <dt>Base</dt>
                        <dd>{featured.base}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Survey</dt>
                      <dd>{site.surveyDate}</dd>
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
              <b data-part="reading">ALT {altitudes[0]}</b>
            </div>
          </div>
          <div data-part="legend" aria-hidden="true" className={styles.elevLegend}>
            <span>Elevation, m</span>
            <i />
          </div>
          <div data-part="coords" aria-hidden="true" className={`${styles.hud} ${styles.hudCoords}`}>
            LAT {degrees(site.lat, "N", "S")} · LON {degrees(site.lon, "E", "W")} · WGS 84
          </div>
          <div role="group" aria-label="Jump to a stage" className={styles.stageTabs}>
            {STAGES.map((name, stage) => (
              <button key={name} type="button" data-tab={stage} onClick={() => jumpTo(stage)} className={styles.stageTab}>
                <span className={styles.tabFill} />
                <span>{name}</span>
                <span data-tab-altitude={stage} className={styles.tabAlt}>
                  {altitudes[stage]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
