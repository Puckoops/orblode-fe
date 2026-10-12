"use client";

import { useEffect, useRef, useState } from "react";
import { posesFor, stageAltitudes, type Camera } from "@/lib/landing/descent";
import type { LandingMedia, Point3 } from "@/lib/landing/media";
import { CloudView } from "../scene/CloudView";
import { cssFont } from "../env";
import { loadScene, type Scene } from "../scene/jobs";
import { useSite } from "../SiteContext";
import { descentPainter, paintDescent, paintHero, paintTurntable, pickPresets, type DescentPainter } from "./paint";
import { CaptureStills } from "./stills";

export type CaptureInfo = Pick<LandingMedia, "site" | "surveyId" | "frame" | "figures"> & {
  stageAltitudes: string[];
  presets: { name: string; a: Point3; b: Point3 }[];
};

type Normalised = [number, number] | null;

/** What the capture script calls in the page; each painter draws one frame and returns its PNG. */
export type CaptureApi = {
  ready(): Promise<CaptureInfo>;
  size(width: number, height: number): { width: number; height: number };
  hero(yaw: number): { png: string; camera: Camera; metresPerPixel: number };
  descent(s: number): { png: string; survey: Normalised; pile: Normalised };
  turntable(yaw: number, elevation: boolean): { png: string; marks: Normalised[] };
  stills(): Promise<Record<string, string>>;
};

declare global {
  interface Window {
    __landingCapture?: CaptureApi;
  }
}

const STILL_TIMEOUT_MS = 60_000;

/** The landing's painters on one canvas, driven frame by frame by scripts/landing/capture.ts. */
export function CaptureStage({ surveyId, stills }: { surveyId: string; stills: boolean }) {
  const site = useSite();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current, root = rootRef.current;
    if (!canvas || !root) return;
    let view = new CloudView(canvas, { maxWidth: 1600 });
    let scene: Scene | null = null, descent: DescentPainter | null = null, points: Point3[] = [];
    let fonts = { sans: "sans-serif", mono: "monospace" };

    const ready = (async (): Promise<CaptureInfo> => {
      scene = await loadScene(site);
      if (!scene.survey) throw new Error("the capture needs the showcase survey, not the sample site");
      fonts = { sans: cssFont(root, "--font-sans", "sans-serif"), mono: cssFont(root, "--font-mono", "monospace") };
      await Promise.all(["400 12px", "500 12px", "500 13px", "600 14px"].flatMap((weight) => [document.fonts.load(`${weight} ${fonts.sans}`), document.fonts.load(`${weight} ${fonts.mono}`)]));
      await document.fonts.ready;
      descent = descentPainter(scene, site);
      const presets = pickPresets(scene, site);
      points = presets.flatMap((p) => [p.a, p.b]);
      const { survey, cloud, frame } = scene;
      return {
        site,
        surveyId,
        frame,
        figures: {
          zmin: cloud.zmin,
          zmax: cloud.zmax,
          interval: survey.interval,
          cell: survey.grid.cell,
          change: survey.change ? { added: survey.change.added, removed: survey.change.removed, range: survey.change.range } : null,
        },
        stageAltitudes: stageAltitudes(posesFor(frame), frame.ground),
        presets,
      };
    })();
    ready.catch((err) => setFailed(err instanceof Error ? err.message : String(err)));

    const need = <T,>(value: T | null): T => {
      if (!value) throw new Error("call ready() first");
      return value;
    };
    const png = () => canvas.toDataURL("image/png");

    window.__landingCapture = {
      ready: () => ready,
      size(width, height) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        view = new CloudView(canvas, { maxWidth: 1600 });
        view.resize();
        return { width: view.width, height: view.height };
      },
      hero(yaw) {
        const out = paintHero(view, need(scene), yaw);
        return { png: png(), ...out };
      },
      descent(s) {
        const anchors = paintDescent(view, need(descent), s, { landCount: 7000, ...fonts });
        return { png: png(), ...anchors };
      },
      turntable(yaw, elevation) {
        const marks = paintTurntable(view, need(scene), yaw, elevation, points);
        return { png: png(), marks };
      },
      async stills() {
        await ready;
        const deadline = Date.now() + STILL_TIMEOUT_MS;
        const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-still]"));
        const out: Record<string, string> = {};
        for (const box of boxes) {
          const name = box.dataset.still!;
          let canvas = box.querySelector<HTMLCanvasElement>("canvas[data-ready]");
          while (!canvas && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
            canvas = box.querySelector<HTMLCanvasElement>("canvas[data-ready]");
          }
          if (!canvas) throw new Error(`still ${name} never finished drawing`);
          out[name] = canvas.toDataURL("image/png");
        }
        return out;
      },
    };
    return () => {
      delete window.__landingCapture;
    };
  }, [site, surveyId]);

  return (
    <div ref={rootRef} style={{ minHeight: "100vh" }}>
      <canvas ref={canvasRef} style={{ position: "fixed", left: 0, top: 0, display: "block", zIndex: 1 }} />
      {stills ? <CaptureStills /> : null}
      {failed ? <p data-capture-error="">{failed}</p> : null}
    </div>
  );
}
