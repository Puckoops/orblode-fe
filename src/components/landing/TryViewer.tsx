"use client";

import { useEffect, useRef, useState } from "react";
import { formatHeading } from "@/lib/landing/format";
import { formatMeasurement, loadOrder, measureBetween, turntableFrame, wrapIndex, type LandingMedia } from "@/lib/landing/media";
import { prefersReducedMotion, watchVisibility } from "./env";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";
import { useSite } from "./SiteContext";

type Turntable = LandingMedia["turntable"];

/** One frame per 5°, so 14.5 px of drag per frame keeps the old viewer's 0.006 rad per pixel. */
const PX_PER_FRAME = 14.5;
const SPIN_MS = 250;
const DECODED = 12;


/** Pre-rendered frames of the twin, keyed by colouring: fetched once, decoded on demand into a small cache. */
class FrameSet {
  private blobs = new Map<number, Blob>();
  private bitmaps = new Map<number, ImageBitmap>();
  private started = false;
  constructor(private readonly t: Turntable, private readonly pattern: string, private readonly onLoad: (i: number) => void) {}

  load() {
    if (this.started) return;
    this.started = true;
    const queue = loadOrder(this.t.frames);
    const next = async (): Promise<void> => {
      const i = queue.shift();
      if (i === undefined) return;
      try {
        const res = await fetch(turntableFrame(this.pattern, i));
        if (res.ok) {
          this.blobs.set(i, await res.blob());
          this.onLoad(i);
        }
      } catch {}
      return next();
    };
    for (let k = 0; k < 4; k++) void next();
  }

  async bitmap(i: number): Promise<ImageBitmap | null> {
    const hit = this.bitmaps.get(i);
    if (hit) {
      this.bitmaps.delete(i);
      this.bitmaps.set(i, hit);
      return hit;
    }
    const blob = this.blobs.get(i);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    this.bitmaps.set(i, bitmap);
    for (const [key, old] of this.bitmaps) {
      if (this.bitmaps.size <= DECODED) break;
      this.bitmaps.delete(key);
      old.close();
    }
    return bitmap;
  }

  dispose() {
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
  }
}

/** The survey as a turntable: drag turns it through pre-rendered frames, and each preset shows a measurement between two points. */
export function TryViewer({ turntable }: { turntable: Turntable }) {
  const site = useSite();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [elevation, setElevation] = useState(false);
  const [preset, setPreset] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const indexRef = useRef(0);
  const elevationRef = useRef(false);
  const nearRef = useRef(false);
  const spinningRef = useRef(true);
  const setsRef = useRef<{ photo: FrameSet; elevation: FrameSet } | null>(null);
  const showRef = useRef<(i: number) => void>(() => {});

  useEffect(() => {
    const frame = frameRef.current, canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!frame || !canvas || !ctx) return;
    let alive = true, visible = false, timer = 0, painting = 0;
    canvas.width = turntable.width;
    canvas.height = turntable.height;
    spinningRef.current = !prefersReducedMotion();

    const paint = async (set: FrameSet, i: number) => {
      const ticket = ++painting;
      const bitmap = await set.bitmap(i).catch(() => null);
      if (!alive || !bitmap || ticket !== painting) return;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      setDrawn(true);
    };
    const current = (): FrameSet => (elevationRef.current ? sets.elevation : sets.photo);
    const onLoad = (elevationSet: boolean) => (i: number) => {
      if (elevationSet === elevationRef.current && i === indexRef.current) void paint(current(), i);
    };
    const sets = {
      photo: new FrameSet(turntable, turntable.photo, onLoad(false)),
      elevation: new FrameSet(turntable, turntable.elevation, onLoad(true)),
    };
    setsRef.current = sets;
    showRef.current = (i) => void paint(current(), i);

    const spin = () => {
      if (!alive || !visible || !spinningRef.current) return;
      const next = wrapIndex(indexRef.current + 1, turntable.frames);
      indexRef.current = next;
      setIndex(next);
      timer = window.setTimeout(spin, SPIN_MS);
    };
    const stopWatching = watchVisibility(
      frame,
      (v) => {
        visible = v;
        window.clearTimeout(timer);
        if (!v) return;
        nearRef.current = true;
        current().load();
        timer = window.setTimeout(spin, SPIN_MS);
      },
      "100% 0px",
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stopWatching();
      sets.photo.dispose();
      sets.elevation.dispose();
    };
  }, [turntable]);

  useEffect(() => {
    elevationRef.current = elevation;
    const sets = setsRef.current;
    if (!sets || !nearRef.current) return;
    (elevation ? sets.elevation : sets.photo).load();
    showRef.current(indexRef.current);
  }, [elevation]);

  useEffect(() => {
    indexRef.current = index;
    showRef.current(index);
  }, [index]);

  const turnTo = (i: number) => {
    spinningRef.current = false;
    setIndex(wrapIndex(i, turntable.frames));
  };

  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, start: indexRef.current, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 4) d.moved = true;
    if (d.moved) turnTo(d.start - Math.round(dx / PX_PER_FRAME));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === "ArrowLeft") turnTo(indexRef.current + 1);
    else if (e.key === "ArrowRight") turnTo(indexRef.current - 1);
    else if (e.key === "Home") turnTo(0);
    else return;
    e.preventDefault();
  };

  const chosen = preset === null ? null : turntable.presets[preset];
  const reading = chosen ? formatMeasurement(measureBetween(chosen.a, chosen.b)) : null;
  const marks = chosen?.marks[index] ?? null;
  const [ax, ay, bx, by] = (marks ?? [0, 0, 0, 0]).map((v, k) => v * (k % 2 ? turntable.height : turntable.width));
  const pill = chosen && reading ? reading.distance : "";
  const pillWidth = pill.length * 7.4 + 16;

  return (
    <section id="try" aria-labelledby="try-title" className={styles.section}>
      <div className={styles.sectionHead}>
        <span className={`${styles.eyebrow} ${styles.eyebrowAccent}`}>Try it</span>
        <h2 id="try-title" className={styles.sectionTitle}>
          Measure {site.name} yourself.
        </h2>
        <p>Drag to orbit. Pick a measurement to see it on the survey.</p>
      </div>
      <div ref={frameRef} className={`${styles.window} ${styles.tryWindow}`}>
        <LandingPicture picture={turntable.poster} alt="" className={`${styles.layer} ${styles.mediaCover}`} />
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="slider"
          aria-label={`${site.name} in 3D. Drag or use the arrow keys to turn it.`}
          aria-valuemin={0}
          aria-valuemax={turntable.frames - 1}
          aria-valuenow={index}
          aria-valuetext={`Heading ${formatHeading(turntable.yaw0 + index * turntable.step)}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          data-ready={drawn ? "" : undefined}
          className={`${styles.layer} ${styles.mediaCover} ${styles.sceneCanvas} ${styles.tryCanvas}`}
        />
        <svg aria-hidden="true" viewBox={`0 0 ${turntable.width} ${turntable.height}`} preserveAspectRatio="xMidYMid slice" className={`${styles.layer} ${styles.tryOverlay}`}>
          {marks && (
            <>
              <line x1={ax} y1={ay} x2={bx} y2={by} className={styles.tryLine} />
              <g transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2 - 18})`}>
                <rect x={-pillWidth / 2} y={-12} width={pillWidth} height={24} rx={6} className={styles.tryPill} />
                <text textAnchor="middle" dominantBaseline="middle" y={1} className={styles.tryPillText}>
                  {pill}
                </text>
              </g>
              {[
                [ax, ay, "A"],
                [bx, by, "B"],
              ].map(([x, y, label]) => (
                <g key={label} transform={`translate(${x} ${y})`}>
                  <circle r={7} className={styles.tryRing} />
                  <circle r={2.5} className={styles.tryDot} />
                  <text x={10} y={-8} className={styles.tryLabel}>
                    {label}
                  </text>
                </g>
              ))}
            </>
          )}
        </svg>
        <div className={styles.tryControls}>
          <div role="group" aria-label="Colour points by" className={styles.segmented}>
            <button type="button" aria-pressed={!elevation} onClick={() => setElevation(false)}>
              Photo
            </button>
            <button type="button" aria-pressed={elevation} onClick={() => setElevation(true)}>
              Elevation
            </button>
          </div>
          <div className={styles.tryTools}>
            <button type="button" onClick={() => setPreset(null)} className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}>
              Clear
            </button>
          </div>
        </div>
        <div aria-live="polite" className={styles.readout}>
          <div role="group" aria-label="Measurements" className={styles.presetList}>
            {turntable.presets.map((p, i) => (
              <button key={p.name} type="button" aria-pressed={preset === i} onClick={() => setPreset(preset === i ? null : i)}>
                {p.name}
              </button>
            ))}
          </div>
          <p className={styles.readoutTitle}>
            {chosen ? `${chosen.name}, A to B on the ${site.surveyDate} survey.` : "Pick a measurement to start."}
          </p>
          <dl>
            <div>
              <dt>Distance</dt>
              <dd>{reading?.distance ?? "–"}</dd>
            </div>
            <div>
              <dt>Horizontal</dt>
              <dd>{reading?.horizontal ?? "–"}</dd>
            </div>
            <div>
              <dt>Height change</dt>
              <dd>{reading?.height ?? "–"}</dd>
            </div>
            <div>
              <dt>Grade</dt>
              <dd>{reading?.grade ?? "–"}</dd>
            </div>
          </dl>
        </div>
        <span aria-hidden="true" className={styles.hint}>
          Drag to orbit · Pick a measurement
        </span>
      </div>
    </section>
  );
}
