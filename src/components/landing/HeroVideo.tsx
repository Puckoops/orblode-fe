"use client";

import { useEffect, useRef, useState } from "react";
import { altitudeOf, eyeOf, type Camera } from "@/lib/landing/descent";
import { formatEastNorth, formatHeading, formatNumber } from "@/lib/landing/format";
import { coverRect, heroYaw, scaleBar, type LandingMedia } from "@/lib/landing/media";
import type { SceneFrame, SiteInfo } from "@/lib/landing/site";
import { prefersReducedMotion, saveData } from "./env";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";
import { useSite } from "./SiteContext";

const NARROW = "(max-width: 699px)";

const positionText = (cam: Camera, site: SiteInfo) => {
  const [x, y] = eyeOf(cam);
  return formatEastNorth(x, y, site.origin);
};
const altitudeText = (cam: Camera, ground: number, site: SiteInfo) =>
  `ALT ${formatNumber(altitudeOf(cam, ground))} m · HDG ${formatHeading(cam.yaw)} · ${site.surveyDate.toUpperCase()}`;

/** The hero's slow orbit over the site, as a looping video, with the instrument readouts that follow its camera. */
export function HeroVideo({ hero, frame }: { hero: LandingMedia["hero"]; frame: SceneFrame }) {
  const site = useSite();
  const videoRef = useRef<HTMLVideoElement>(null);
  const positionRef = useRef<HTMLDivElement>(null);
  const altitudeRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const barLabelRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState<boolean | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const rendition = window.matchMedia(NARROW).matches ? hero.tall : hero.wide;
    const box = video.parentElement!;
    let alive = true, frameCallback = 0, raf = 0, last = -1;

    const updateHud = (time: number) => {
      const cam = { ...rendition.camera, yaw: heroYaw(time, hero.yaw0, hero.sway, hero.loop) };
      if (positionRef.current) positionRef.current.textContent = positionText(cam, site);
      if (altitudeRef.current) altitudeRef.current.textContent = altitudeText(cam, frame.ground, site);
      const rect = coverRect({ width: box.clientWidth, height: box.clientHeight }, rendition.video);
      const bar = scaleBar(rendition.metresPerPixel / (rect.width / rendition.video.width));
      if (barRef.current) barRef.current.style.width = `${bar.px.toFixed(1)}px`;
      if (barLabelRef.current) barLabelRef.current.textContent = `${bar.metres} m`;
    };
    updateHud(0);

    if (prefersReducedMotion() || saveData()) return;
    const follow = () => {
      if (!alive) return;
      if (Math.abs(video.currentTime - last) >= 0.1) {
        last = video.currentTime;
        updateHud(last);
      }
      if ("requestVideoFrameCallback" in video) frameCallback = video.requestVideoFrameCallback(follow);
      else raf = requestAnimationFrame(follow);
    };
    const onPlaying = () => {
      video.dataset.ready = "";
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.muted = true;
    // Autoplay rather than play() alone, so a page opened in a background tab starts once it is shown.
    video.autoplay = true;
    video.src = rendition.video.mp4;
    video.play().catch(() => {});
    follow();

    return () => {
      alive = false;
      if (frameCallback && "cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(frameCallback);
      cancelAnimationFrame(raf);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [hero, frame, site]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const initial = { ...hero.wide.camera, yaw: hero.yaw0 };
  return (
    <>
      <LandingPicture picture={hero.wide.poster} narrow={hero.tall.poster} alt="" priority className={`${styles.layer} ${styles.mediaCover}`} />
      <video ref={videoRef} muted loop playsInline aria-hidden="true" className={`${styles.layer} ${styles.mediaCover} ${styles.sceneCanvas}`} />
      <div aria-hidden="true" className={`${styles.layer} ${styles.heroScrim}`} />
      <div aria-hidden="true" className={`${styles.layer} ${styles.hud}`}>
        <span className={`${styles.corner} ${styles.cornerTl}`} />
        <span className={`${styles.corner} ${styles.cornerTr}`} />
        <span className={`${styles.corner} ${styles.cornerBl}`} />
        <span className={`${styles.corner} ${styles.cornerBr}`} />
        <span className={styles.reticle} />
        <div className={styles.hudSite}>
          <div>SURVEY · {site.name.toUpperCase()}</div>
          <div className={styles.hudDim}>
            SURVEYED {site.surveyDate.toUpperCase()} · {site.crs}
          </div>
        </div>
        <div className={styles.hudRead}>
          <div className={styles.scalebar}>
            <i ref={barRef} />
            <span ref={barLabelRef}>100 m</span>
          </div>
          <div ref={positionRef}>{positionText(initial, site)}</div>
          <div ref={altitudeRef}>{altitudeText(initial, frame.ground, site)}</div>
        </div>
      </div>
      {playing !== null && (
        <button type="button" onClick={toggle} className={styles.heroPause} aria-label={playing ? "Pause the background video" : "Play the background video"}>
          {playing ? "Pause" : "Play"}
        </button>
      )}
    </>
  );
}
